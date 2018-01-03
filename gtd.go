package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"

	"flag"
	"io/ioutil"
	"os"
	"strconv"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

type Activity struct {
	Id   int64  `json:"id"`
	Name string `json:"name"`
	Npom int    `json:"npom"`
}

var (
	logD *log.Logger
	logI *log.Logger
	logW *log.Logger
	logE *log.Logger
)

var db *sql.DB

func initLoggers(debugMode bool) {
	debugHandle := ioutil.Discard
	if debugMode {
		debugHandle = os.Stdout
	}
	logD = log.New(debugHandle, "[D] ", log.Ldate|log.Ltime|log.Lshortfile)
	logI = log.New(os.Stdout, "[I] ", log.Ldate|log.Ltime|log.Lshortfile)
	logW = log.New(os.Stdout, "[W] ", log.Ldate|log.Ltime|log.Lshortfile)
	logE = log.New(os.Stderr, "[E] ", log.Ldate|log.Ltime)
}

type userCtx struct {
	Id     *uint
	fbId   string
	fbName string
}

type handleFunc func(user *userCtx, w http.ResponseWriter, r *http.Request, logPrefix string)

type handlerWithAuthCheck struct {
	handle  handleFunc
	allowed map[string]bool
}

func newHandlerWithAuthCheck(f func(user *userCtx, w http.ResponseWriter, r *http.Request, logPrefix string),
	allowed map[string]bool) handlerWithAuthCheck {
	return handlerWithAuthCheck{f, allowed}
}

func (h handlerWithAuthCheck) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	logPrefix := fmt.Sprintf(">> %s: ", briefDescr(r))
	logD.Printf(logPrefix)

	lrw := &loggingResponseWriter{ResponseWriter: w}
	defer func() {
		logPrefix = fmt.Sprintf("<< %s: ", briefDescr(r))
		logD.Printf(logPrefix+"status: %d", lrw.statusCode)
		logD.Printf(logPrefix+"body: %s\n", lrw.response)
	}()

	user, err := authorize(r, h.allowed)
	if err != nil {
		forbidden(logPrefix+"authorize", err, lrw)
		return
	}

	uid, err := selectUser(user.fbId)
	if err != nil {
		internalError(logPrefix+"select user from db", err, lrw)
		return
	}

	user.Id = uid

	h.handle(&user, lrw, r, briefDescr(r)+" ")
}

func main() {
	debugMode := flag.Bool("debug", false, "debug logging")
	configPath := flag.String("conf", "/etc/gtd/gtd.conf", "config path")
	flag.Parse()

	initLoggers(*debugMode)

	// parse config
	var conf configImpl
	if err := InitConfig(*configPath, &conf); err != nil {
		logE.Fatalf("init config: %v", err)
	}

	// prepare db
	var err error
	_, err = os.Stat(conf.params.DBPath)
	dbExists := err == nil

	db, err = sql.Open("sqlite3", conf.params.DBPath)
	if err != nil {
		logE.Fatalf("create db connection: %v", err)
	}
	if db == nil {
		logE.Fatalf("failed to create db connection")
	}
	if !dbExists {
		logI.Println("db does not exist; creating tables")
		if err = createTables(); err != nil {
			log.Fatalf("create tables: %v", err)
		}
	} else {
		logI.Println("db already exists")
		if err = db.Ping(); err != nil {
			log.Fatalf("ping db: %v", err)
		}
	}

	// initialize local variables
	allowed := make(map[string]bool)
	for _, id := range conf.params.AllowedFbUids {
		allowed[id] = true
	}

	// initialize handlers
	fs := http.FileServer(http.Dir(conf.params.StaticPath))

	http.Handle("/static/", http.StripPrefix("/static/", fs))

	limitAllowedUsers := func(f handleFunc) handlerWithAuthCheck {
		return newHandlerWithAuthCheck(f, allowed)
	}

	router := mux.NewRouter()
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		t, err := template.ParseFiles(conf.params.StaticPath + "html/index.html")
		if err != nil {
			internalError("parse template file", err, w)
			return
		}
		t.Execute(w, nil)
	})

	router.Handle("/users/new", limitAllowedUsers(newUserHandler)).Methods("POST")

	routerCats := router.PathPrefix("/categories").Subrouter()
	routerCats.Handle("/", limitAllowedUsers(categoriesListHandler)).Methods("GET")
	routerCats.Handle("/new", limitAllowedUsers(newCategoryHandler)).Methods("POST")
	routerCats.Handle("/{id:[0-9]+}", limitAllowedUsers(removeCategoryHandler)).Methods("DELETE")

	routerActs := router.PathPrefix("/activities").Subrouter()
	routerActs.Handle("", limitAllowedUsers(activitiesListHandler)).Methods("GET").
		Queries("cat_id", "{cat_id:[0-9]+}")
	routerActs.Handle("/new", limitAllowedUsers(newActivityHandler)).Methods("POST")

	router.Handle("/history", limitAllowedUsers(historyHandler)).Methods("GET").
		Queries("cat_id", "{cat_id:[0-9]+}")
	router.Handle("/history/do", limitAllowedUsers(doHandler)).Methods("POST")

	http.Handle("/", router)

	logI.Printf("start listening port %d :)", conf.params.ListenPort)
	http.ListenAndServe(fmt.Sprintf(":%d", conf.params.ListenPort), nil)
}

func createTables() error {
	var err error

	// activities
	if _, err = db.Exec(`
	create table activities
	(
		id INTEGER PRIMARY KEY,
		name TEXT not null,
		npom INT default 0,
		createtime TIMESTAMP not null,
		category_id INTEGER,
		vorder INT default 0 not null,
		foreign key (category_id) references categories (id)
	);
	`); err != nil {
		return fmt.Errorf("create table 'activities': %v", err)
	}

	// categories
	if _, err = db.Exec(`
	create table categories
	(
		id INTEGER PRIMARY KEY,
		name TEXT not null,
		user_id INTEGER,
		foreign key (user_id) references users (id)
	);
	`); err != nil {
		return fmt.Errorf("create table 'categories': %v", err)
	}

	// history
	if _, err = db.Exec(`
	create table history
	(
		id INTEGER PRIMARY KEY,
		tstamp TIMESTAMP not null,
		done INT default 0,
		activity_id INTEGER
			constraint history_activities_id_fk
				references activities (id)
					on delete cascade,
		user_id INTEGER,
		foreign key (user_id) references users (id)
	);
	`); err != nil {
		return fmt.Errorf("create table 'history': %v", err)
	}

	// users
	if _, err = db.Exec(`
	create table users
	(
		id INTEGER PRIMARY KEY,
		registered TIMESTAMP,
		fb_id VARCHAR not null,
		name VARCHAR
	);
	`); err != nil {
		return fmt.Errorf("create table 'users': %v", err)
	}

	if _, err = db.Exec(`
	create unique index users_fb_id_uindex
		on users (fb_id);
	`); err != nil {
		return fmt.Errorf("create index for 'users.fb_id': %v", err)
	}

	return nil
}

// Handlers -->

func newUserHandler(user *userCtx, w http.ResponseWriter, _ *http.Request, logPrefix string) {
	if user.Id == nil {
		logD.Printf("no user with fb id=%s found; creating new user record", user.fbId)
		var err error
		var stmt *sql.Stmt
		stmt, err = db.Prepare(`INSERT INTO users VALUES (NULL, ?, ?, ?);`)
		if err != nil {
			internalError(logPrefix+"prepare insert new user query", err, w)
			return
		}
		now := int(time.Now().Unix() * 1000)
		if _, err = stmt.Exec(now, user.fbId, user.fbName); err != nil {
			internalError(logPrefix+"exec insert new user query", err, w)
			return
		}
		w.WriteHeader(http.StatusCreated)
	} else {
		logD.Println(logPrefix + "user already exists in db")
		w.WriteHeader(http.StatusConflict)
	}
}

func doHandler(user *userCtx, w http.ResponseWriter, r *http.Request, logPrefix string) {
	var doRequest struct {
		ActivityId int64 `json:"activity"`
		DoneVal    int   `json:"done_value"`
	}
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&doRequest); err != nil {
		badRequest("decode do request", err, w)
		return
	}

	uid, err := selectUser(user.fbId)
	if err != nil || uid == nil {
		internalError("select uid", err, w)
		return
	}

	stmt, err := db.Prepare(`INSERT INTO history VALUES (NULL, ?, ?, ?, ?);`)
	if err != nil {
		internalError(logPrefix+"prepare insert new action query", err, w)
		return
	}

	now := int(time.Now().Unix() * 1000)
	if _, err = stmt.Exec(now, doRequest.DoneVal, doRequest.ActivityId, uid); err != nil {
		internalError(logPrefix+"exec insert new action query", err, w)
		return
	}

	done, err := doneToday(doRequest.ActivityId)
	if err != nil {
		internalError(logPrefix+"select all pomodoros done today for this activity", err, w)
		return
	}

	rows, err := db.Query(`SELECT npom FROM activities WHERE id=?;`, doRequest.ActivityId)
	if err != nil {
		internalError(logPrefix+"select npom from activities", err, w)
		return
	}
	defer rows.Close()

	var total int
	for rows.Next() {
		err = rows.Scan(&total)
		if err != nil {
			internalError(logPrefix+"read next row", err, w)
			return
		}
	}

	b := struct {
		Activity    int64 `json:"activity"`
		NewValue    int   `json:"new_value"`
		Left        int   `json:"left"`
		LastUpdated int   `json:"last_updated"`
	}{doRequest.ActivityId, done, total - done, now}
	body, err := json.Marshal(b)
	if err != nil {
		internalError(logPrefix+"encode response", err, w)
		return
	}
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, string(body))
}

func historyHandler(user *userCtx, w http.ResponseWriter, r *http.Request, logPrefix string) {
	if user.Id == nil {
		forbidden(logPrefix+"user not found in db", nil, w)
		return
	}

	catIdStr := r.URL.Query().Get("cat_id")
	if len(catIdStr) == 0 {
		badRequest(logPrefix+"invalid cat_id query param", nil, w)
		return
	}

	catId, err := strconv.ParseInt(catIdStr, 10, 64)
	if err != nil {
		badRequest(logPrefix+"not a num cat_id query param", err, w)
		return
	}
	h, err := selectWeekHist(*user.Id, catId)
	if err != nil {
		internalError("select week hist", err, w)
		return
	}

	respBody, err := json.Marshal(h)
	if err != nil {
		internalError("encode week hist", err, w)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, string(respBody))
}

func categoriesListHandler(user *userCtx, w http.ResponseWriter, _ *http.Request, logPrefix string) {
	if user.Id == nil {
		forbidden(logPrefix+"user not found in db", nil, w)
		return
	}

	rows, err := db.Query(`SELECT C.id, C.name FROM categories C
WHERE C.user_id=?;`, *user.Id)
	if err != nil {
		internalError(logPrefix+"select categories list from db", err, w)
		return
	}
	defer rows.Close()
	type catInfo struct {
		Id   int64  `json:"id"`
		Name string `json:"name"`
	}
	var catList []catInfo

	for rows.Next() {
		var cat catInfo
		err = rows.Scan(&cat.Id, &cat.Name)
		if err != nil {
			internalError(logPrefix+"read next row", err, w)
			return
		}
		catList = append(catList, cat)
	}

	respBody, err := json.Marshal(catList)
	if err != nil {
		internalError("encode activities list", err, w)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, string(respBody))
}

func newCategoryHandler(user *userCtx, w http.ResponseWriter, r *http.Request, logPrefix string) {
	if user.Id == nil {
		forbidden(logPrefix+"user not found in db", nil, w)
		return
	}

	var newCategoryRequest struct {
		Name string `json:"name"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&newCategoryRequest); err != nil {
		badRequest(logPrefix+"decode new category", err, w)
		return
	}

	stmt, err := db.Prepare(`INSERT INTO categories VALUES (NULL, ?, ?);`)
	if err != nil {
		internalError(logPrefix+"prepare insert new category query", err, w)
		return
	}

	var execRes sql.Result
	if execRes, err = stmt.Exec(newCategoryRequest.Name, *user.Id); err != nil {
		internalError("exec insert new category query", err, w)
		return
	}

	newId, err := execRes.LastInsertId()
	if err != nil {
		internalError(logPrefix+"get last insert id", err, w)
		return
	}

	w.WriteHeader(http.StatusCreated)
	fmt.Fprint(w, fmt.Sprintf(`{"id":%d}`, newId))
}

func removeCategoryHandler(user *userCtx, w http.ResponseWriter, r *http.Request, logPrefix string) {
	if user.Id == nil {
		forbidden(logPrefix+"user not found in db", nil, w)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 2 {
		internalError(logPrefix+"invalid url", nil, w)
		return
	}

	catId, err := strconv.ParseInt(parts[len(parts)-1], 10, 64)
	if err != nil {
		internalError(logPrefix+"convert category id to number: %v", err, w)
		return
	}

	logD.Printf(logPrefix+"removing category %d", catId)

	// Remove row from categories
	stmt, err := db.Prepare(`DELETE FROM categories WHERE id=?;`)
	if err != nil {
		internalError(logPrefix+"failed to prepare delete query: %v", err, w)
		return
	}

	if _, err = stmt.Exec(catId); err != nil {
		internalError("exec remove category query", err, w)
		return
	}

	// Remove corresponding rows from activities
	stmt, err = db.Prepare(`DELETE FROM activities WHERE category_id=?;`)
	if err != nil {
		internalError(logPrefix+"failed to prepare delete query: %v", err, w)
		return
	}

	if _, err = stmt.Exec(catId); err != nil {
		internalError("exec remove activities query", err, w)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func activitiesListHandler(user *userCtx, w http.ResponseWriter, r *http.Request, logPrefix string) {
	if user.Id == nil {
		forbidden(logPrefix+"user not found in db", nil, w)
		return
	}

	catIdStr := r.URL.Query().Get("cat_id")
	if len(catIdStr) == 0 {
		badRequest(logPrefix+"invalid cat_id query param", nil, w)
		return
	}

	catId, err := strconv.ParseInt(catIdStr, 10, 64)
	if err != nil {
		badRequest(logPrefix+"not a num cat_id query param", err, w)
		return
	}

	var rows *sql.Rows
	rows, err = db.Query(`SELECT A.id, A.name, A.npom FROM activities A
JOIN categories C ON A.category_id = C.id WHERE C.id=? AND C.user_id=?
ORDER BY vorder ASC;`, catId, *user.Id)
	if err != nil {
		internalError("select activities list", err, w)
		return
	}
	defer rows.Close()

	var aclist struct {
		Activities []Activity `json:"activities"`
	}
	for rows.Next() {
		var a Activity
		err = rows.Scan(&a.Id, &a.Name, &a.Npom)
		if err != nil {
			internalError(logPrefix+"read next row", err, w)
			return
		}
		aclist.Activities = append(aclist.Activities, a)
	}

	respBody, err := json.Marshal(aclist)
	if err != nil {
		internalError(logPrefix+"encode activities list", err, w)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, string(respBody))
}

func newActivityHandler(user *userCtx, w http.ResponseWriter, r *http.Request, logPrefix string) {
	if user.Id == nil {
		forbidden("user not found in db", nil, w)
		return
	}
	var newAct struct {
		Name  string `json:"name"`
		Npoms int    `json:"npoms"`
		CatId int64  `json:"cat_id"`
	}
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&newAct); err != nil {
		badRequest(logPrefix+"decode new activity", err, w)
		return
	}

	stmt, err := db.Prepare(`INSERT INTO activities VALUES (NULL, ?, ?, ?, ?, (SELECT
IFNULL(max(vorder), 0) FROM activities) + 1);`)
	if err != nil {
		internalError(logPrefix+"prepare insert new activity query", err, w)
		return
	}

	execRes, err := stmt.Exec(newAct.Name, newAct.Npoms, time.Now().Unix()*1000, newAct.CatId)
	if err != nil {
		internalError(logPrefix+"exec insert new activity query", err, w)
		return
	}
	newId, err := execRes.LastInsertId()
	if err != nil {
		internalError(logPrefix+"get last insert id", err, w)
		return
	}

	w.WriteHeader(http.StatusCreated)
	fmt.Fprint(w, fmt.Sprintf(`{"id":%d}`, newId))
}

// <-- Handlers

// Authorize by parsing bearer token from header and returns retrieved from fb /me info
func authorize(r *http.Request, allowed map[string]bool) (user userCtx, err error) {
	authHdr := r.Header.Get("Authorization")
	bearerPrefix := "Bearer "
	if !strings.HasPrefix(authHdr, bearerPrefix) || len(authHdr) == len(bearerPrefix) {
		err = fmt.Errorf("received invalid auth header: %s", authHdr)
		return
	}
	token := authHdr[len(bearerPrefix):]
	httpc := http.Client{}
	req, err := http.NewRequest("GET", "https://graph.facebook.com/v2.10/me?access_token="+token, nil)
	if err != nil {
		err = fmt.Errorf("prepare GET /me request: %v", err)
		return
	}
	respFbMe, err := httpc.Do(req)
	if err != nil {
		err = fmt.Errorf("process /me request", err)
		return
	}
	defer respFbMe.Body.Close()
	var fbMe struct {
		Name string `json:"name"`
		Id   string `json:"id"`
	}
	dec := json.NewDecoder(respFbMe.Body)
	if err = dec.Decode(&fbMe); err != nil {
		err = fmt.Errorf("decode /me body", err)
		return
	}
	if _, found := allowed[fbMe.Id]; !found {
		err = fmt.Errorf("not in allowed list")
		return
	}
	if len(fbMe.Name) == 0 || len(fbMe.Id) == 0 {
		err = fmt.Errorf("unexpected /me body: %v", respFbMe)
		return
	}
	user.fbId = fbMe.Id
	user.fbName = fbMe.Name

	return
}

// DB helpers -->

func selectUser(fbId string) (uid *uint, err error) {
	var rows *sql.Rows
	rows, err = db.Query(`SELECT id FROM users WHERE fb_id=?;`, fbId)
	if err != nil {
		err = fmt.Errorf(`select id from table "users": %v`, err)
		return
	}
	defer rows.Close()
	if rows.Next() {
		uid = new(uint)
		err = rows.Scan(uid)
		if err != nil {
			err = fmt.Errorf("read next row: %v", err)
			return
		}
	}
	return
}

func selectWeekHist(uid uint, catId int64) (hist map[int64][7]int, err error) {
	weekAgo := time.Now().AddDate(0, 0, -6)
	weekStart := time.Date(weekAgo.Year(), weekAgo.Month(), weekAgo.Day(), 0, 0, 0, 0, weekAgo.Location())
	var rows *sql.Rows
	rows, err = db.Query(`SELECT A.id, H.tstamp, H.done
FROM history H JOIN activities A ON H.activity_id = A.id
JOIN categories C ON A.category_id = C.id JOIN users U ON C.user_id = U.id
WHERE U.id = ? AND C.id = ? AND H.tstamp >= ?;`, uid, catId, weekStart.Unix()*1000)
	if err != nil {
		err = fmt.Errorf("select week history: %v", err)
		return
	}
	defer rows.Close()
	hist = make(map[int64][7]int)
	for rows.Next() {
		var acid int64
		var tstamp time.Time
		var done int
		err = rows.Scan(&acid, &tstamp, &done)
		if err != nil {
			err = fmt.Errorf("scan next row: %v", err)
			return
		}
		dayOffset := int(tstamp.Sub(weekStart).Hours() / 24)
		curDone := hist[acid]
		curDone[dayOffset] += done
		hist[acid] = curDone
	}
	return
}

func doneToday(activityId int64) (total int, err error) {
	today := time.Now()
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	todayTs := today.Unix() * 1000
	var rows *sql.Rows
	rows, err = db.Query(`SELECT H.done
FROM history H JOIN activities A ON H.activity_id = A.id
JOIN categories C ON A.category_id = C.id
WHERE A.id = ? AND H.tstamp >= ?;`, activityId, todayTs)
	if err != nil {
		err = fmt.Errorf("select week history: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var done int
		if err = rows.Scan(&done); err != nil {
			err = fmt.Errorf("scan next row: %v", err)
			return
		}
		total += done
	}
	return
}

// <-- DB helpers
