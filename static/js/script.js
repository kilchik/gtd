
function logD(msg) {
    console.info("[D]", msg);
}

function logI(msg) {
    console.info("[I]", msg);
}

function logE(msg) {
    console.error("[E]", msg);
}

function render() {
    "use strict";
    $("#mainContainer .content").hide();
    $("#notallowed-alert").hide();

    if (isLoggedIn()) {
        showUserButton(true);
        renderAuthorized();
    } else {

        showUserButton(false);
        renderNotAuthorized();
    }
}

function generateAddActivity(catId, nameInput, pomsInput) {
    logD(`generating add activity function with catId=${catId}, nameInput=${nameInput}`)
    return function () {
        // TODO: WHY ON EARTH?! catId is called but nameInput.val() not yet
        addActivity(catId, nameInput.val(), parseInt(pomsInput.val(), 10));
    }
}

function appendCatView(showId, catId, acts, hist) {
    logD(`appending category view: show=${showId},id=${catId}, acts=${JSON.stringify(acts)}, hist=${JSON.stringify(hist)}`);

    let catDiv = document.createElement("div");
    catDiv.setAttribute("id", `cat${catId}`);

    let catDivCls = "tab-pane fade";
    if (showId === 0) {
        catDivCls += " in active";
    }
    catDiv.setAttribute("class", catDivCls);

    let catTable = generateCatHistTable(catId, acts, hist);
    if (catTable) {
        catDiv.appendChild(catTable);
    }
    catDiv.appendChild(generateAddActivityForm(catId));

    let button = $(catDiv).find("button.add-activity-button");
    let nameInput = $(catDiv).find("input.new-activity-name");
    let pomsInput = $(catDiv).find("input.new-activity-poms");
    button.on('click', generateAddActivity(catId, nameInput, pomsInput));

    $('.tab-content').append(catDiv);
}

async function renderAuthorized() {
    logD("rendering authorized");

    setInterval(function() { checkLoginState(false); }, 3600000);
    // enable navbar item
    $("#categoriesList").removeClass("disabled");

    let cats = await fetchCategories();
    logD("categories: "+JSON.stringify(cats));
    if (cats) {
        showCategoriesNavigation(cats);

        for (let ci = 0; ci < cats.length; ++ci) {
            let actsObj = await fetchActivities(cats[ci].id);
            logD("activities: "+JSON.stringify(actsObj.activities));
            let hist = await fetchHistory(cats[ci].id);
            logD("history: "+JSON.stringify(hist));

            appendCatView(ci, cats[ci].id, actsObj.activities, hist);
        }
    }

    let content = $(".authorized");
    content.show();
}

function generateCatHistTable(catId, actList, hist) {
    logD(`generating history table for category ${catId}, with actions ${JSON.stringify(actList)} and history ${JSON.stringify(hist)}`);
    let table = document.createElement("table");
    table.setAttribute("class", "table table-bordered table-hover");

    if (!actList) {
        logI("empty list of actions");
        return
    }

    let header = document.createElement("thead");
    let headerRow = document.createElement("tr");
    headerRow.innerHTML += "<th>#</th>";
    $.each(last7Days(), function(i, val) {
        headerRow.innerHTML += `<th>${val}</th>`
    });
    header.appendChild(headerRow);
    table.appendChild(headerRow);

    let tableBody = document.createElement("tbody");
    $.each(actList, function(_, actItem) {
        let r = createActRow(actItem.id, actItem.name, actItem.npom, hist[actItem.id]);
        tableBody.appendChild(r);
    });

    table.appendChild(tableBody);

    return table;
}

function generateAddActivityForm(catId) {
    logD("generating add-activity form");
    let form = document.createElement("form");
    form.setAttribute("class", "form-inline");

    form.innerHTML = `
<form id="addActivityForm" class="form-inline">
     <div class="form-group">
        <label class="sr-only" for="new-activity-name">Name of activity to add</label>
        <input type="text" class="new-activity-name form-control" placeholder="Activity">
    </div>
    <div class="form-group">
        <label class="sr-only" for="new-activity-poms">Number of pomodoros to complete</label>
        <input type="number" class="new-activity-poms form-control" placeholder="1">
    </div>
    <button type="submit" class="add-activity-button btn btn-primary">Add activity</button>
</form>
`;
    return form;
}


function renderNotAuthorized() {
    logD("rendering unauthorized");
    // disable navbar item
    $('#categoriesList').addClass("disabled");

    let content = $('.unauthorized');
    content.show();
}

async function fetchCategories() {
    logD("fetching categories");
    let token = localStorage.getItem("access-token");
    if (!token) {
        //todo: handle error
        return;
    }

    return $.when($.ajax({
        type: "GET",
        url: "categories",
        dataType: "json",
        beforeSend: function (xhr) {
            let tokenHdr = "Bearer " + token;
            xhr.setRequestHeader("Authorization", tokenHdr);
        },
    }));
}

async function fetchActivities(catId) {
    logD("fetching activities");
    let token = localStorage.getItem('access-token');
    if (!token) {
        //todo: handle error
        return
    }

    return $.when($.ajax({
        type: "GET",
        url: "activities?cat_id="+catId,
        dataType: "json",
        beforeSend: function (xhr) {
            let tokenHdr = "Bearer " + token;
            xhr.setRequestHeader('Authorization', tokenHdr);
        },
    }));
}

async function fetchHistory(catId) {
    logD("fetching history");
    let token = localStorage.getItem('access-token');
    if (!token) {
        //todo: handle error
        return
    }

    return $.when($.ajax({
        type: "GET",
        url: "history?cat_id="+catId,
        dataType: "json",
        beforeSend: function (xhr) {
            let tokenHdr = "Bearer " + token;
            xhr.setRequestHeader('Authorization', tokenHdr);
        },
    }));
}


function showUserButton(authorized) {
    if (authorized) {
        let link = document.createElement("a");
        link.setAttribute("class", "navbar-link");
        link.onclick = signOut;
        link.href = "#";
        link.innerText = "Sign out";
        document.getElementById("userButton").appendChild(link);
    } else {
        let button = document.createElement("fb:login-button");
        button.setAttribute("scope", "public_profile,email");

        button.setAttribute("onlogin", "checkLoginState(true);");
        document.getElementById("userButton").appendChild(button);
    }
}

function checkLoginState(refresh) {
    FB.getLoginStatus(function(response) {
        let token = response.authResponse.accessToken;
        let tokenTimeout = response.authResponse.expiresIn;

        logD("tokenTimeout: " + tokenTimeout);
        $.ajax({
            type: "POST",
            url: "users/new",
            dataType: "json",
            data: JSON.stringify(response),
            beforeSend: function (xhr) {
                let tokenHdr = "Bearer " + token;
                xhr.setRequestHeader('Authorization', tokenHdr);
            },
            complete: function (xhr, textStatus) {
                logD("users/new status: " + xhr.status);
                if (xhr.status === 403) {
                    let naalert = $("#notallowed-alert");
                    naalert.show();
                } else {
                    localStorage.setItem("access-token", response.authResponse.accessToken);

                    let curTs = new Date().getTime() / 1000;
                    logD("curTs: ", curTs);
                    let expTs = curTs + response.authResponse.expiresIn;
                    logD("expTs: ", expTs);

                    localStorage.setItem("token-expir-time", expTs);
                    if (refresh) {
                        location.reload();
                    }
                }
            }
        });
    });
}

function updatePomodoros(actId) {
    return function (response) {
        let cell = document.getElementById('cell'+actId);
        cell.innerHTML = response.new_value;
        let newCls = cellClass(response.new_value, response.new_value+response.left);
        logD(`update pomodoros: new cell class=${newCls}`);
        cell.parentElement.setAttribute("class", newCls);
    }
}

function doPomodoro(newVal, actId) {
    data = {
        "activity": actId,
        "done_value": 1,
    };

    let token = localStorage.getItem("access-token");
    $.ajax({
        type: "POST",
        url: "history/do",
        dataType: "json",
        data: JSON.stringify(data),
        beforeSend: function (xhr) {
            let tokenHdr = "Bearer " + token;
            xhr.setRequestHeader('Authorization', tokenHdr);
        },
        success: updatePomodoros(actId),
    });
}

function cellClass(real, actPoms) {
    logD(`calc cell class for real=${real}, actPoms=${actPoms}`);
    let cls = "danger";
    if (real >= actPoms) {
        cls = "success";
    } else if (real > 0) {
        cls = "info";
    }
    return cls;
}

function createActRow(actId, actName, actPoms, actHist) {
    logD(`creating row for action with id=${actId}, name=${actName}, poms=${actPoms}, hist=${actHist}`);

    let row = document.createElement("tr");
    row.innerHTML += `<th scope="row">${actName} (${actPoms})</th>`;
    for (i = 0; i < 6; ++i) {
        let real = 0;
        if (actHist) {
            real = actHist[i];
        }
        row.innerHTML += `<td class="${cellClass(real, actPoms)}">${real}</td>`;
    }

    let todayVal = parseInt(actHist ? actHist[6] : '0');
    let addButton = `<button type="button" class="btn btn-default btn-xs" onclick="doPomodoro(${todayVal}+1, ${actId})"><span class="glyphicon glyphicon-plus"></span></button>`;

    row.innerHTML += `<td class="${cellClass(todayVal, actPoms)}"><div id="cell${actId}" class="pull-left">${todayVal}</div><div class="pull-right">${addButton}</div></td>`;
    return row;
}

function createCategory() {
    let name = $("#newCategoryInput").val();
    logD(`creating category ${name}`);
    let token = localStorage.getItem("access-token");
    $.ajax({
        type: "POST",
        url: "categories/new",
        dataType: "json",
        data: `{"name":"${name}"}`,
        beforeSend: function (xhr) {
            let tokenHdr = "Bearer " + token;
            xhr.setRequestHeader('Authorization', tokenHdr);
        },
        success: function (response) {
            $('#newCatDialog').hide();
            let pill = createCategoryPill(response.id, name);
            let allPills = $('#catPills');
            let pillsNum = $('#catPills>li').length;

            logD(`pills num: ${pillsNum}`);
            let viewId = -1;
            if (pillsNum === 0) {
                pill.setAttribute("class", "active");
                viewId = 0;
            }

            allPills.append(pill);

            appendCatView(viewId, response.id, null, null);
        },
        complete: function (xobj, code) {
            if (xobj.code !== 200) {
                logW("categories/new completed with code: ", code);
            }
        }
    });
}

function createCategoryPill(id, name) {
    let newItem = document.createElement("li");
    newItem.setAttribute("role", "presentation");

    let link = document.createElement("a");
    link.setAttribute("data-toggle", "pill");

    link.href = "#cat" + id;
    link.innerText = name;
    newItem.appendChild(link);
    return newItem;
}

function showCategoriesNavigation(cats) {
    logD("show categories navigation");
    let pillsNav = document.getElementById("catPills");
    cats.forEach(function (item, i, cats) {
        let pill = createCategoryPill(item.id, item.name);
        if (i === 0) {
            pill.setAttribute("class", "active");
        }
        pillsNav.appendChild(pill);
    });

}

function addActivity(catId, actName, actPoms) {
    logD(`adding activity with catId=${catId}, name=${actName}, poms=${actPoms}`);
    let token = localStorage.getItem("access-token");
    $.ajax({
        type: "POST",
        url: "activities/new",
        dataType: "json",
        data: JSON.stringify({
                "name": actName,
                "npoms": actPoms,
                "cat_id": catId,
            }),
        beforeSend: function (xhr) {
            let tokenHdr = "Bearer " + token;
            xhr.setRequestHeader('Authorization', tokenHdr);
        },
        success: function (response) {
            logD("response: " + response);
            let r = createActRow(response.id, actName, actPoms, null);

            let tbody = $(`#cat${catId} tbody`);
            if (tbody.length === 0) {
                let actList = [
                    {
                        "id": response.id,
                        "name": actName,
                        "npom": actPoms,
                    }
                ];

                let actId = response.id;
                let actHist = {
                    actId : [0,0,0,0,0,0,0]
                };

                let tbl = generateCatHistTable(catId, actList, actHist);
                $(`#cat${catId}`).prepend(tbl);
            }
            tbody.append(r);
        },
        complete: function (xobj, code) {
            console.log(code);
        }
    });

}

function isLoggedIn() {
    let t = localStorage.getItem("access-token");
    if (t == null) {
        return false;
    }

    let expTs = localStorage.getItem("token-expir-time");
    let curTs = new Date().getTime() / 1000;
    if (expTs < curTs) {
        localStorage.removeItem("access-token");
        return false;
    }

    return true;
}

function signOut() {
    localStorage.removeItem("access-token");
    location.reload();
}


// utility functions

function last7Days() {
    let weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let today = new Date();
    let res = [];
    for (let offset = 6; offset >= 0; offset--) {
        let day = new Date();
        day.setDate(today.getDate()-offset);
        let headerStr = weekDays[day.getDay()];
        headerStr += " " + [day.getDate(), (day.getMonth()+1), day.getFullYear()].join("/");
        res.push(headerStr);
    }
    return res;
}
