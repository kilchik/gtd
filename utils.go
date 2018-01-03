package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func printRequest(r *http.Request) {
	logD.Printf(">> [%s %s]", r.Method, r.URL.Path)
	logD.Printf(">> %v", r)
}

type loggingResponseWriter struct {
	http.ResponseWriter
	response   string
	statusCode int
}

func (lrw *loggingResponseWriter) Write(response []byte) (int, error) {
	lrw.response = string(response)
	return lrw.ResponseWriter.Write(response)
}

func (lrw *loggingResponseWriter) WriteHeader(statusCode int) {
	lrw.statusCode = statusCode
	lrw.ResponseWriter.WriteHeader(statusCode)
}

func briefDescr(req *http.Request) string {
	return fmt.Sprintf("[%s %s]", req.Method, req.URL.Path)
}

func httpError(errMsg string, errData interface{}, status int, w http.ResponseWriter) {
	errMsg = fmt.Sprintf("%s: %v", errMsg, errData)
	logE.Println(errMsg)
	logD.Printf("httpError: status: %d", status)
	//w.WriteHeader(status)
	http.Error(w, errMsg, status)
}

func internalError(errMsg string, errData interface{}, w http.ResponseWriter) {
	httpError(errMsg, errData, http.StatusInternalServerError, w)
}

func badRequest(errMsg string, errData interface{}, w http.ResponseWriter) {
	httpError(errMsg, errData, http.StatusBadRequest, w)
}

func forbidden(errMsg string, errData interface{}, w http.ResponseWriter) {
	httpError(errMsg, errData, http.StatusForbidden, w)
}

func weekdays(today time.Time) (days [7]string) {
	for decrIdx := 6; decrIdx >= 0; decrIdx-- {
		d := today.AddDate(0, 0, -decrIdx)
		days[6-decrIdx] = d.Format("Jan 2\nMon")
	}
	return
}

func parseIdFromPathTail(urlPath string) (catId int64, err error) {
	parts := strings.Split(urlPath, "/")
	if len(parts) < 2 {
		err = fmt.Errorf("number of path parts is %d", len(parts))
		return
	}

	catId, err = strconv.ParseInt(parts[len(parts)-1], 10, 64)
	if err != nil {
		err = fmt.Errorf("convert category id to number: %v", err)
		return
	}

	return
}
