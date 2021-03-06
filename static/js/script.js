
let EditActionType = {
    Update: 1,
    Remove: 2
};

let editActionsQueue = [];

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
    $("#mainContainer").find(".content").hide();
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
    logD(`generating add activity function with catId=${catId}, nameInput=${nameInput}`);
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

function generateAddActivityForm() {
    logD("generating add-activity form");
    let form = document.createElement("form");
    form.setAttribute("class", "form-inline");

    form.innerHTML = `
<form class="add-activity-form form-inline">
    <div class="form-group">
        <label class="sr-only" for="new-activity-name">Name of activity to add</label>
        <input type="text" class="new-activity-name form-control" placeholder="Activity">
    </div>
    <div class="form-group">
        <label class="sr-only" for="new-activity-poms">Number of pomodoros to complete</label>
        <input type="number" class="new-activity-poms form-control" placeholder="1">
    </div>
    <button type="submit" class="add-activity-button btn btn-primary">Add activity</button>
    <button id="cancelEditingButton" onclick="cancelEditing()" type="button" style="visibility:hidden;" class="btn pull-right">Cancel</button>
    <button id="stopEditingButton" onclick="finalizeEditing()" type="button" style="visibility:hidden;" class="btn btn-danger pull-right">Done</button>
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
        url: "categories/",
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
            complete: function (xhr) {
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

function passIdToModal(actId) {
    $("#done-editing-button").attr("data-id", actId);
}

function createActRow(actId, actName, actPoms, actHist) {
    logD(`creating row for action with id=${actId}, name=${actName}, poms=${actPoms}, hist=${actHist}`);

    let row = document.createElement("tr");
    row.setAttribute("data-id", actId);
    row.innerHTML += `<th scope="row">${actName} (${actPoms})</th>`;
    for (i = 0; i < 6; ++i) {
        let real = 0;
        if (actHist) {
            real = actHist[i];
        }
        row.innerHTML += `<td class="${cellClass(real, actPoms)}">${real}</td>`;
    }

    let todayVal = parseInt(actHist ? actHist[6] : '0');
    let addButton = `<button type="button" class="btn btn-default btn-xs add-pom-button" onclick="doPomodoro(${todayVal}+1, ${actId})"><span class="glyphicon glyphicon-plus"></span></button>`;

    row.innerHTML += `<td class="${cellClass(todayVal, actPoms)}"><div id="cell${actId}" class="pull-left">${todayVal}</div><div class="pull-right">${addButton}</div></td>`;

    let editGlyph = `<span class="glyphicon glyphicon-edit"></span>`;
    let editButton = `<button type="button" class="btn btn-default btn-xs edit-act-button" style="visibility: hidden" data-toggle="modal" onclick="passIdToModal(${actId})" data-target="#edit-act-dlg">${editGlyph}</button>`;

    let deleteGlyph = `<span class="glyphicon glyphicon-remove"></span>`;
    let deleteButton = `<button type="button" class="btn btn-default btn-xs remove-act-button" style="visibility: hidden" onclick="removeActivity(${actId})">${deleteGlyph}</button>`;

    row.innerHTML += `<td>${editButton}${deleteButton}</td>`;
    return row;
}

function addEditHistoryAction(action) {
    logD("addEditHistoryAction " + JSON.stringify(action));
    editActionsQueue.push(action);
}

function updateActivity() {
    let id = $("#done-editing-button").attr("data-id");
    logD(`updateActivity(${id})`);

    let newName = $("#new-activity-name").val();
    let newNpom = $("#new-activity-poms").val();

    let rowHeader = $(`tr[data-id=${id}]`).find("th");
    rowHeader.text(`${newName} (${newNpom})`);

    addEditHistoryAction({type: EditActionType.Update, id: id, name: newName, npom: newNpom});
}

function removeActivity(id) {
    logD(`removeActivity(${id})`);

    $(`[data-id=${id}]`).remove();

    addEditHistoryAction({type: EditActionType.Remove, id: id});
}


function processErrorWhileEditingHist(errorMsg) {
    logE(errorMsg);

    // TODO: show alert or msg with error
}

function cancelEditing() {
    logD("cancel editing");
    toggleEditView(false);
}

async function finalizeEditing() {
    logD("finish editing");

    let token = localStorage.getItem("access-token");
    for (let actId = 0, a = editActionsQueue[actId]; actId < editActionsQueue.length; ++actId) {
        logD("iterating: " + JSON.stringify(a));
        try {
            switch (a.type) {
                case EditActionType.Remove:
                    await $.when($.ajax({
                        type: "DELETE",
                        url: "activities/" + a.id,
                        beforeSend: function (xhr) {
                            let tokenHdr = "Bearer " + token;
                            xhr.setRequestHeader('Authorization', tokenHdr);
                        },
                    }));
                    break;
                case EditActionType.Update:
                    await $.when($.ajax({
                        type: "PUT",
                        url: "activities/" + a.id,
                        data: `{"name":"${a.name}", "npom":${a.npom}}`,
                        beforeSend: function (xhr) {
                            let tokenHdr = "Bearer " + token;
                            xhr.setRequestHeader('Authorization', tokenHdr);
                        },
                    }));
                    break;
                default:
                    logE("unknown edit action");
            }
        }
        catch (e) {
            processErrorWhileEditingHist(`Error occured while editing activity`);
        }
    }

    toggleEditView(false);
}

function toggleVisibility(elements, defaultValue, on) {
    let newValue = defaultValue;
    if (!on) {
        newValue = defaultValue === "visible" ? "hidden" : "visible";
    }
    elements.css("visibility", newValue);
}

function toggleEditView(on) {
    let activeView = $("#histView").find(".active");

    toggleVisibility(activeView.find(".add-pom-button"), "hidden", on);
    toggleVisibility(activeView.find(".edit-act-button"), "visible", on);
    toggleVisibility(activeView.find(".remove-act-button"), "visible", on);

    let form = activeView.find(".form-inline");
    toggleVisibility(form.find("#cancelEditingButton"), "visible", on);
    toggleVisibility(form.find("#stopEditingButton"), "visible", on);
    toggleVisibility(form.children().not("#cancelEditingButton").not("#stopEditingButton"), "hidden", on);

    $(".tab-content").css({"border-color": on ? "red" : "white"});
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
            $('#new-cat-doc').hide();
            let pill = createCategoryPill(response.id, name);
            let allPills = $('#catPills');
            let pillsNum = allPills.find(" > li").length;

            logD(`pills num: ${pillsNum}`);
            let viewId = -1;
            if (pillsNum === 0) {
                pill.setAttribute("class", "active");
                viewId = 0;
            }

            allPills.append(pill);

            appendCatView(viewId, response.id, null, null);
        },
        complete: function (xobj) {
            if (xobj.code !== 200) {
                logD("categories/new completed with code: ", xobj.code);
            }
        }
    });
}

function removeCategory() {
    logD(`removing category`);
    let token = localStorage.getItem("access-token");
    let catId = $("#catPills").find(".active").attr("data-id");
    $.ajax({
        type: "DELETE",
        url: "categories/"+catId,
        beforeSend: function (xhr) {
            let tokenHdr = "Bearer " + token;
            xhr.setRequestHeader('Authorization', tokenHdr);
        },
        success: function () {
            logD("removed category successfully");
            location.reload();
        },
        complete: function (xobj) {
            $('#remove-cat-doc').hide();
            if (xobj.code !== 200) {
                logD("remove category failed: ", xobj.code);
            }
        }
    });
}

function renameCategory() {
    logD(`renaming category`);
    let token = localStorage.getItem("access-token");
    let catId = $("#catPills").find(".active").attr("data-id");
    let newName = $("#renameCategoryInput").val();
    $.ajax({
        type: "PUT",
        url: "categories/"+catId,
        data: `{"name":"${newName}"}`,
        beforeSend: function (xhr) {
            let tokenHdr = "Bearer " + token;
            xhr.setRequestHeader('Authorization', tokenHdr);
        },
        success: function () {
            logD("renamed category successfully");
            location.reload();
        },
        complete: function (xobj) {
            $('#rename-cat-doc').hide();
            if (xobj.code !== 200) {
                logD("remove category failed: ", xobj.code);
            }
        }
    });
}

function createCategoryPill(id, name) {
    let newItem = document.createElement("li");
    newItem.setAttribute("data-id", id);
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
    cats.forEach(function (item, i) {
        let pill = createCategoryPill(item.id, item.name);
        if (i === 0) {
            pill.setAttribute("class", "active");
        }
        pillsNav.appendChild(pill);
    });

    // set edit-history action
    $("#categoriesList").find("a:contains('Edit history')").click(function () {
        startEditingTable();
    });
}

function startEditingTable() {
    toggleEditView(true);
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

            let cat = $(`#cat${catId}`);
            let tbody = cat.find("tbody");
            if (tbody.length === 0) {
                let actList = [
                    {
                        "id": response.id,
                        "name": actName,
                        "npom": actPoms,
                    }
                ];

                let actHist = {
                    actId : [0,0,0,0,0,0,0]
                };

                let tbl = generateCatHistTable(catId, actList, actHist);
                cat.prepend(tbl);
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
