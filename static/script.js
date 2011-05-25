var userstate = {};
var currentTime = Date();
var currentClaim;
var displayedClaims = [];
var currentDisplay = {};
var cachedClaims = {};
var cachedSearches = {};
var submitted;
var loggedIn = false;
var user;
var domain = "Public";
var reputation;
var proposedEstimate;
var proposedHistory;
var display;
var queuedAlert = "";
var activeLink = "";

function fragmentDisplay(){
    return parseDisplay($.param.fragment());
}

function parseDisplay(x){
    result = {};
    if (x == '') {
        result['type'] = 'default';
    } else{
        parts  = (x).split("+");
        if (parts[0] == 'search'){
            result['type'] = 'search';
            result['search'] = parts[1];
        } else if (parts[0] == 'displayclaim'){
            result['type'] = 'displayclaim';
            result['claim'] = parseInt(parts[1]);
        } else if (parts[0] == 'submitclaim'){
            result['type'] = 'submitclaim';
        }
    } 
    return result;
}

function getData(display){
    if (display['type'] == 'displayclaim'){
        id = display['claim'];
        serverQuery({'topic':id,}, function(){
            proposedHistory = new Array();
            h = cachedClaims[parseInt(id)]['history'];
            for (i = 0; i < h.length; i++){
                proposedHistory.push(h[i]);
            }
            proposedHistory.push({'user':user, 'time':currentTime});
            attemptUpdateDisplay(display);
        });
    } else if (display['type']=='search'){
        serverQuery({'search':display['search']}, function(){
            attemptUpdateDisplay(display);
        });
    } else {
        serverQuery({'search':domain}, function(){
            attemptUpdateDisplay(display);
        });
    }
}

function cacheContainsClaim(id, requireHistory){
    return (id in cachedClaims && (!requireHistory || 'history' in cachedClaims[id]));
}

function cacheContainsSearch(search){
    return (search in cachedSearches);
}

function setAlert(message){
    $('#alertbox').html(message);
    $('#alertbox').show();
}

function clearAlert(){
    $('#alertbox').hide();
}

function attemptUpdateDisplay(newDisplay){
    if (newDisplay['type'] == 'submitclaim' && !loggedIn){
        setAlert("You must be logged in to submit a claim.");
        changeDisplay({type:'search', search:domain});
    } else if (readyToDisplay(newDisplay)){
        currentDisplay = newDisplay;
        updateDisplay(newDisplay);
    }
}

function readyToDisplay(newDisplay){
    if (newDisplay['type']=='displayclaim'){
        return (cacheContainsClaim(newDisplay['claim'], true));
    } else if (newDisplay['type']=='search'){
        return (cacheContainsSearch(newDisplay['search']));
    } 
    return true;
}

// Make sure that everything is in the cache before calling this 
function updateDisplay(newDisplay){
    if (newDisplay['type'] == 'search'){
        displayClaims(cachedSearches[newDisplay['search']]);
    } else if (newDisplay['type'] == 'displayclaim'){
        id = newDisplay['claim'];
        displayClaim(id);
    } else if (newDisplay['type'] == 'submitclaim'){
        displaySubmitClaim();
    }
    // Update sidebar
    newSidebar = loginSidebarBlock();
    if (newDisplay['type'] == 'displayclaim'){
        newSidebar += betSidebarBlock(id);
    }
    newSidebar += domainSidebarBlock();
    if (newDisplay['type'] == 'displayclaim' && canAdministrate(id)){
        newSidebar += administrateClaimSidebarBlock();
    }
    $('#sidebar').html(newSidebar);
    initializeSidebar(newDisplay);
}

function administrateClaimSidebarBlock(){
    result = "<div class='sidebarblock'>";
    result += "<div class='row'> <a id='confirm'> Confirm This Claim.</a> </div>";
    result += "<div class='row'> <a id='deny'> Deny This Claim.</a> </div>";
    result += "</div>";
    return result;
}

function displayReputation(x){
    return (x).toFixed(2);
}

function cacheSearch(search, result){
    dirty = false;
    if (search in cachedSearches){
        oldresult = cachedSearches[search];
        if (oldresult.length != result.length) dirty = true;
        else {
            for (i = 0; i < oldresult.length; i++){
                if (oldresult[i] != result[i]) dirty = true;
            }
        }
    } else {
        dirty = true;
    }
    if (dirty){
        dirtySearch(search);
    }
    cachedSearches[search] = result;
    return dirty;
}

function cacheClaim(claim){
    id = claim['id'];
    if (!(id in cachedClaims) || newerClaim(claim, cachedClaims[id])){
        cachedClaims[id] = claim;
        dirtyClaim(id);
    }
}

function changed(display1, display2){
    if (display1['type'] != display2['type']) return true;
    else if (display1['type'] == 'displayclaim') return (display1['claim'] != display2['claim']);
    else if (display1['type'] == 'search') return (display1['search'] != display2['search']);
}

function dirtyClaim(id){
}

function dirtySearch(search){
}

function newerClaim(claim1, claim2){
    return (claim1['lastbettime'] > claim2['lastbettime']);
}

function submitClaimBox(){
    newMainFrame = "<div class='submitbetbox'>";
    newMainFrame += "<div class='row'>Short description: <input type='text' id='shortdescription' size='50' maxlength='200'></input> </div>";
    newMainFrame += "<div class='row'><div class='left'>Precise definition:</div> <textarea id='longdescription'></textarea> </div>";
    newMainFrame += "<div class='row'>Bounty: <input type='text' id='bountyinput' size='4' maxlength='5'></input>";
    newMainFrame += "Maximum Risk (as fraction of reputation): <input type='text' id='maxstakeinput' size='4' maxlength='5'></input>";
    newMainFrame += "Initial Estimate: <input type='text' id='initialestimate' size='4' maxlength='5'></input> </div>";
    newMainFrame += "<div class='row'> Market closes (optional): <input type='text' id='closedate'></input> <input type='text' id='closetime'></input> </div>";
    newMainFrame += "<div class='row'> <a class='orange' id='submitclaimbutton'> Submit Claim </a> </div>";
    newMainFrame += "<div class='error row' id='submitclaimerror'> </div>";
    newMainFrame += "</div>";
    return newMainFrame;
}

function isClosed(id){
    claim = cachedClaims[id];
    return (claim['closes'] && claim['closes'] < new Date());
}

function serverQuery(query, f){
    if (typeof(f)=='undefined') f = function(){};
    if (! ('user' in query) ) query['user']=user;
    $.post('query', query, function(xml){
        setCurrentTime(xml);
        $(xml).find('topic').each(function(){
            cacheClaim(claimFromXML(this));
        });
        $(xml).find('search').each(function(){
            result = new Array();
            $(this).find('topic').each(function(){
                result.push(parseInt($(this).find('id').text()));
            });
            cacheSearch($(this).find('query').text(), result);
        });
        $(xml).find('history').each(function(){
            id = parseInt($(this).find('id').text());
            updateHistory(id, this);
        });
        newReputation = parseFloat($(xml).find('user').find('reputation').text());
        if (! isNaN(newReputation) ) reputation = newReputation;
        f(xml);
    }, "xml");
}

function initializeSubmitClaim(){
    submitted = false;
    $('#submitclaimbutton').click(function(){
        submitClaim();
    });
    $('#initialestimate').val(0.5);
    $('#initialestimate').focus(function(){
        this.select();
    });
    $('#maxstakeinput').val(0.5);
    $('#maxstakeinput').focus(function(){
        this.select();
    });
    $('#bountyinput').val(1.0);
    $('#bountyinput').focus(function(){
        this.select();
    });
    $('#closetime').timepicker({});
    $('#closedate').datepicker({});
}

function parseDate(strDate){
    if (strDate == 'None') return null;
    parts = strDate.split(/[\.\s\/:-]/);
    return new Date(parts[0], parts[1]-1, parts[2], parts[3], parts[4], parts[5]);
}

function parseDateTime(strDate, strTime){
    dateParts = strDate.split(/[\.\s\/:-]/);
    timeParts = strTime.split(/[\.\s\/:-]/);
    return new Date(dateParts[2], dateParts[0]-1, dateParts[1], timeParts[0], timeParts[1]);
}

function submitClaim(){
    if (submitted) return;
    proposedEstimate = $('#initialestimate').val();
    bounty = $('#bountyinput').val();
    maxstake = $('#maxstakeinput').val();
    description = $('#shortdescription').val();
    definition = $('#longdescription').val();
    closes = parseDateTime($('#closedate').val(), $('#closetime').val());
    falseRisk = bounty*Math.log(proposedEstimate);
    trueRisk = bounty*Math.log(1 - proposedEstimate);
    if (trueRisk < -1 * maxstake * reputation || falseRisk < -1 * maxstake * reputation){
        claimError("You cannot risk that much.");
    } else if (description.length < 5){
        claimError("That description is too short.");
    }else if (bounty <= 0 || isNaN(bounty)){
        claimError("The bounty must be a positive number.");
    } else if (isNaN(maxstake) || maxstake <= 0 || maxstake > 1){
        claimError("The maximum stake must be a number between 0 and 1.");
    } else if (isNaN(proposedEstimate) || proposedEstimate < 0 || proposedEstimate > 1){
        claimError("The initial estimate must be a number between 0 and 1.");
    }else{
        claimError("");
        submitted = true;
        serverQuery({   submitclaim:1, user:user, probability:proposedEstimate,maxstake:maxstake, description:description, bounty:bounty, 
                        definition:definition, domain:domain, closes:serverDate(closes) },
        function(xml){
            setDisplay({'type':'search', 'search':domain});
        });
    }
}

function claimError(str){
    $('#submitclaimerror').html(str);
}

function sortByAge(claim1, claim2){
    date1 = claim1['age'];
    date2 = claim2['age'];
    if (date1 > date2) return -1;
    else if (date2 > date1) return 1;
    else return 0;
}

function getPayoff(outcome){
    np = proposedEstimate;
    if (!outcome) np = 1 - np;
    p = currentClaim['currentbet'];
    if (!outcome) p = 1 - p;
    return currentClaim['bounty'] * (Math.log(np) - Math.log(p));
}


function getCommitment(id,h, outcome){
    claim = cachedClaims[id];
    result = 0;
    p = h[0]['probability'];
    if (!outcome) p = 1 - p;
    if (user == h[0]['user'])
        result += claim['bounty'] * Math.log(p);
    for (i=1; i<h.length; i++){
        np = h[i]['probability'];
        if (!outcome) np = 1 - np;
        if (user == h[i]['user']){
            result += claim['bounty'] * (Math.log(np) - Math.log(p));
        }
        p = np;
    }
    return result;
}

function displayBet(x){
    return (100*x).toFixed(0);
}

function claimFromXML(xml){
    result = {};
    result['id'] = parseInt($(xml).find('id').text());
    result['currentbet'] = parseFloat($(xml).find('currentbet').text());
    result['description'] = $(xml).find('description').text();
    result['lastbetter'] = $(xml).find('lastbetter').text();
    result['closes'] = parseDate($(xml).find('closes').text());
    result['owner'] = $(xml).find('owner').text();
    result['age'] = parseDate($(xml).find('age').text());
    result['lastbettime'] = parseDate($(xml).find('lastbettime').text());
    result['bounty'] = parseFloat($(xml).find('bounty').text());
    result['maxstake'] = parseFloat($(xml).find('maxstake').text());
    definition = $(xml).find('definition').text();
    result['definition'] = (definition == 'none') ? null : definition;
    return result;
}           

function topicBox(id){
    claim = cachedClaims[id];
    result = "<div class='topicbox'>";
    href = "#displayclaim+"+id;
    result += "<h2> <a href='"+href+"' class='betdescription'>" + claim['description'] + "</a> </h2>";
    result += "<div class='currentbet orange'>" + displayBet(claim['currentbet']) + "%</div>";
    result += "<a class='orange right' href='" + href + "' id='displaybutton"+id+"'>Bet on it!</a>";
    result += '<img id="betloader'+id+'" class="loading right" src="ajax-loader.gif"></img>';
    result += "<div class='betdata'>";
    result += "<div class='clear'> Last bet by " + claim['lastbetter'] + " " + displayDate(claim['lastbettime']) + ".</div>";
    if (claim['closes'])
        result += "<div class='clear'> Bet closes " + displayDate(claim['closes']) + ".</div>";
    result += "<div class='clear'> Submitted by " + claim['owner'] + " " + displayDate(claim['age']) +".</div>";
    result += "</div>";
    result += "</div>";
    result += "<hr/>";
    return result;
}

function displayClaims(results){
    newMainFrame = "";
    for (i = 0; i < results.length; i++){
        newMainFrame += topicBox(results[i]);
    }
    $('#mainframe').html(newMainFrame);
    for (i = 0; i < results.length; i++){
        $('#displaybutton'  + results[i]).click(prepareLoader(results[i]));
    }
}

function prepareLoader(x){
    var y = x;
    return function(){
        $('#betloader' + y).css("visibility", "visible"); 
     }
}

function displayClaim(id){
    claim = cachedClaims[id];
    newMainFrame = "";
    newMainFrame += descriptionBox(id);
    if (isClosed(id)){
        newMainFrame += closedBetBox(id);
    }else{
        newMainFrame += betBox(id);
    }
    newMainFrame += "<div id='implicitrightsidebar'>";
    if (loggedIn && !isClosed(id)) newMainFrame += stakeBox(id);
    newMainFrame += historyBox(id);
    newMainFrame += "</div>";
    if (definition) newMainFrame += definitionBox(id);
    $('#mainframe').html(newMainFrame);
    initializeTopic(id);
}

function displaySubmitClaim(){
    $('#mainframe').html(submitClaimBox());
    initializeSubmitClaim();
}

function definitionBox(id){
    claim = cachedClaims[id];
    if (claim['definition']){
        return "<div class='farleft' id='definitionbox'> <h3> Precise definition </h3>" + claim['definition'] + "</div>";
    } else return "";
}

function descriptionBox(id){
    claim = cachedClaims[id];
    return "<div class='clear descriptionbox'> <h1> \"" + claim['description'] + "\"</h1> </div>"
}

function stakeBox(id){
    claim = cachedClaims[id];
    result = "<table id='stakebox' class='center'>";
    result += "<tr> <th colspan='3'> <h3> Your Stake </h3> </th> </tr>";
    result += "<tr> <td> </td> <td> True </td> <td> False </td> </tr>";
    result += "<tr> <td>Current  </td>";
    result += "<td> <span id='currenttruestake' class='payoff'> </span> </td>";
    result += "<td> <span id='currentfalsestake' class='payoff'> </span> </td> </tr>";
    result += "<tr> <td>This Bet</td>";
    result += "<td> <span id='thistruestake' clas='payoff'> </span> </td>";
    result += "<td> <span id='thisfalsestake' class='payoff'> </span> </td> </tr>";
    result += "<tr> <td> Total </td>";
    result += "<td> <span id='totaltruestake' class='payoff'>  </span> </td>";
    result += "<td> <span id='totalfalsestake' class='payoff'>  </span> </td> </tr>";
    result += "</table>";
    return result;
}

function oldStakeBox(id){
    claim = cachedClaims[id];
    result = "<div id='stakebox'>";
    result += "<div class='row'> If its true, you get an additional <span id='potentialtruepayoff'></span>, "
    result += "<span id='potentialtruecommitment'></span> total.</div>"
    result += "<div class='row'> If its false, you get an additional <span id='potentialfalsepayoff'></span>, "
    result += "<span id='potentialfalsecommitment'></span> total.</div>"
    result += "<div class='row' id='riskcomparison'> Max risk is " + displayReputation(claim['maxstake']) + " * ";
    result += displayReputation(reputation) + " = " + displayReputation(claim['maxstake']* reputation) + "</div>";
    result += "</div>"
    return result;
}

function closedBetBox(id){
    claim = cachedClaims[id];
    result = "<div class='betbox'>";
    result += "<table>";
    result += "<tr> <td colspan='2'> Betting was closed on this claim " + displayDate(claim['closes']) + ". </td> </tr>";
    result += "<tr> <td colspan='2'> The market consensus at that time: </td> </tr>";
    result += "<tr> <td>";
    result += "<div id='oldbet' class='betslider'></div>";
    result += "</td> <td> ";
    result += "<div id='oldbettext'>" + displayBet(claim['currentbet']) +  "% </div>";
    result += "</td> </tr>";
    result += "</table>";
    result += "</div>";
    return result;
}

    

function betBox(id){
    claim = cachedClaims[id];
    result = "<div class='betbox'>";
    result += "<table>";
    result += "<tr> <td colspan='2'> Current Consensus: </td> </tr>";
    result += "<tr> <td>";
    result += "<div id='oldbet' class='betslider'></div>";
    result += "</td> <td> ";
    result += "<div id='oldbettext'>" + displayBet(claim['currentbet']) +  "% </div>";
    result += "</td> </tr>";
    result += "<tr> <td colspan='2'> Your Update: </td> </tr>"
    result += "<tr> <td> <div id='newbet' class='betslider'></div> </td> ";
    result += "<td> <div class='betvalue'> <input type='text' id='betinput'></input> % </div>";
    result += "</td> </tr>";
    result += "</table>";
    result += '<div class="row"> <a id="submitbet" class="orange left">Bet on it!</a>';
    result += '<img id="betloader" class="loading left" src="ajax-loader.gif"></img></div>';
    result += '<div class="clear error" id="beterror"></div>';
    result += "</div>";
    return result;
}

function historyBox(id){
    claim = cachedClaims[id];
    result = "<table id='historybox' class='center'>";
    result += "<tr> <th colspan='3'> <h3> History </h3> </th> </tr>";
    result += "<tr class='underline'> <td> Estimate </td> <td> User </td> <td> Time </td> </tr>";
    alt=true;
    h = claim['history'];
    for (i = h.length - 1; i >= h.length-10 && i >= 0; i--){
        result += alt ? "<tr class='odd'>" : "<tr class='even'>";
        alt = !alt;
        result += "<td>" + displayBet(h[i]['probability']) +" % </td>";
        result += "<td> "  + h[i]['user'] + " </td>";
        result += "<td> "  + displayDate(h[i]['time']) + " </td></tr>"
    }
    result += "</table>";
    return result;
}

function serverDate(d){
    month = "" + (d.getMonth() + 1);
    hour = "" + (d.getHours());
    minute = "" + d.getMinutes();
    second = "" + d.getSeconds();
    day = "" + d.getDate();
    while (month.length < 2) month="0" + month;
    while (hour.length < 2) hour="0" + hour;
    while (minute.length < 2) minute="0" + minute;
    while (second.length < 2) second="0" + second;
    while (day.length < 2) day="0" + day;
    return "" + (d.getFullYear()) + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second;
}

function displayDate(d){
    description = "ago";
    seconds = (currentTime - d)/1000;
    if (seconds < 0){
        seconds = - seconds;
        description = "from now";
    }
    minutes = Math.round(seconds / 60);
    hours = Math.round(minutes / 60);
    days = Math.round(hours / 24);
    years = Math.round(days / 365);
    if (seconds < 100) result = seconds + " seconds " + description;
    else if (minutes < 100) result = minutes + " minutes " + description;
    else if (hours < 100) result = hours + " hours " + description;
    else if (days < 1000) result = days + " days " + description;
    else result = years + " years " + description;
    return "<span title='" + d + "'>"+result +"</span>";
}

function updateHistory(id, xml){
    claim = cachedClaims[id];
    newHistory = new Array();
    $(xml).find('bet').each(function(){
        newHistory.push( { 'user':$(this).find('user').text(), 'time':parseDate($(this).find('time').text()), 'probability':parseFloat($(this).find('probability').text()) } );
    });
    claim['history'] = newHistory;
    if (currentDisplay['type'] == 'displayclaim' && currentDisplay['claim'] == claim['id'])
        $('#historybox').replaceWith(historyBox(id));
}

function setEstimate(id, newEstimate, source){
    claim = cachedClaims[id];
    proposedEstimate = newEstimate;
    proposedHistory[proposedHistory.length-1]['probability'] = newEstimate;
    if (source != "slider"){
        $('#newbet').slider({
            value: [ newEstimate ],
        });
    }
    if (source != "field"){
        $('#betinput').val( displayBet(newEstimate) );
    }
    recalculateView(id);
}

function recalculateView(id){
    claim = cachedClaims[id];
    currentTrueStake = getCommitment(id, claim['history'], true);
    currentFalseStake = getCommitment(id, claim['history'], false);
    totalTrueStake = getCommitment(id, proposedHistory, true);
    totalFalseStake = getCommitment(id, proposedHistory, false);
    $('#oldbettext').html(displayBet(claim['currentbet']) + "%");
    $('#currenttruestake').html(displayReputation(currentTrueStake));
    $('#currentfalsestake').html(displayReputation(currentFalseStake));
    $('#thistruestake').html(displayReputation(totalTrueStake - currentTrueStake));
    $('#thisfalsestake').html(displayReputation(totalFalseStake - currentFalseStake));
    $('#totaltruestake').html(displayReputation(totalTrueStake));
    $('#totalfalsestake').html(displayReputation(totalFalseStake));
    if (totalTrueStake < -1 * claim['bounty'] * reputation) { 
        $('#totaltruestake').addClass('error');
    } else{
        $('#totaltruestake').removeClass('error');
    }
    if (totalFalseStake < -1 * claim['bounty'] * reputation) { 
        $('#totalfalsestake').addClass('error');
    } else{
        $('#totalfalsestake').removeClass('error');
    }
}

function tooCommitted(id){
    claim = cachedClaims[id];
    if (isNaN(getCommitment(id, proposedHistory, true)) || isNaN(getCommitment(id, proposedHistory, false))) return true;
    return (getCommitment(id, proposedHistory, true) < -1 * claim['maxstake'] * reputation || getCommitment(id, proposedHistory, false) < -1 * claim['maxstake'] * reputation);
}

function initializeTopic(id){
    claim = cachedClaims[id];
    $('#oldbet').slider({
        range: "min",
        disabled: true,
    });
    $('.betslider').slider({
        min: 0,
        max: 1,
        step: 0.01,
        value: [ claim['currentbet'] ],
        orientation: "horizontal",
        animate: "normal",
        range: "min",
    });
    setEstimate(id, claim['currentbet'], "");
    $('#newbet').slider({
        slide:function(event, ui){
            claim = cachedClaims[id];
            setEstimate(id, ui.value, "slider");
        },
    });
    $('#betinput').blur(function(){
        claim = cachedClaims[id];
        if (isNaN($('#betinput').val())) setEstimate(id, claim['currentbet'],"");
        else setEstimate(id, ($('#betinput').val())/100, "");
    });
    $('#betinput').focus(function(){
        this.select();
    });
    $('#betinput').keyup(function(){
        claim = cachedClaims[id];
        setEstimate(id, ($('#betinput').val())/100, "field");
    });
    $('#submitbet').click(function(){
        claim = cachedClaims[id];
        if (!loggedIn){
            betError("You must be logged in to bet.");
        } else if (tooCommitted(id)){
            betError("You cannot risk that much.");
        } else if (isNaN(proposedEstimate) || proposedEstimate < 0 || proposedEstimate > 1){
            betError("Your new estimate must be a number between 0 and 1.");
        }else{
            betError("");
            submitBet(id, proposedEstimate);
        }
    });
}

function submitBet(id, bet){
            $('#betloader').css("visibility", "visible");
            claim = cachedClaims[id];
            serverQuery({'makebet':1, 'user':user, 'topic':claim['id'], 'probability':bet, 'lastbettime':serverDate(claim['lastbettime'])},
            function(xml){
                $('#betloader').css("visibility", "hidden");
                claim = cachedClaims[id];
                response = $(xml).find('makebet').find('response').text();
                if (response=='success') {
                    $('#oldbet').slider({
                        value: [ bet ],
                    });
                    recalculateView(id);
                } else if (response=='interveningbet'){
                    betError("This view is no longer up to date (someone else has interfered).");
                } else {
                    betError("You cannot risk that much.");
                }
            });
}

function logout(){
    loggedIn = false;
    user = "";
    userstate = {};
    saveState();
    attemptUpdateDisplay(fragmentDisplay());
}

function login(username, password){
    serverQuery({'login':1, 'user':username, 'password':password},
        function(xml){
            result = $(xml).find('login').text();
            if (result == 'success'){
                clearAlert();
                user = $(xml).find('user').find('name').text();
                userstate['username'] = username;
                userstate['password'] = password;
                saveState();
                loggedIn = true;
                attemptUpdateDisplay(fragmentDisplay());
            } else if (result == 'nosuchuser'){
                loginError('No such user.');
            } else if (result == 'wrongpassword'){
                loginError('Incorrect password.');
            }
        });
}

function setCurrentTime(xml){
    currentTime = parseDate($(xml).find('currenttime').text());
}

function signup(username, password){
    serverQuery({'signup':1, 'user':username, 'password':password},
        function(xml){
            result = $(xml).find('signup').text();
            if (result == 'success'){
                clearAlert();
                user = $(xml).find('user').find('name').text();
                loggedIn=true;
                updateDisplay(currentDisplay);
            } else if (result == 'usernametaken'){
                loginError('That username is taken.');
            } else if (result == 'shortusername'){
                loginError('Enter a username and password above.\nYour username must be at least 3 characters.');
            } else if (result == 'shortpassword'){
                loginError('Your password must be at least 3 characters.');
            }
        });
}

function resolveBet(id, outcome){
    serverQuery({'topic':id, 'resolvebet':1, 'outcome':outcome, 'search':domain},
        function(xml){
            newDisplay = { 'type':'search', 'search':domain};
            setDisplay(newDisplay);
        });
}

function loginError(error){
    $('#loginerror').html(error);
}

function betError(error){
    $('#beterror').html(error);
}

function loginSidebarBlock(){
    result = "";
    if  (loggedIn){
        result += "<div class='sidebarblock'> ";
        result += "<div class='row'> You are logged in as " + user + "</div> ";
        result += "<div class='row'> You reputation is " + displayReputation(reputation) + "</div> ";
        result += "<div class='row'> <input type='submit' class='left' value='Log Out' id='logoutbutton'></input></div> ";
        result += "</div>";
    } else{
        result += "<div class='sidebarblock'> ";
        result += "<div class='row'>Username:</div> ";
        result += "<div class='row'> <input type='text' id='usernameinput'></input> </div>";
        result += "<div class='row'>Password:</div> ";
        result += "<div class='row'> <input type='password' id='passwordinput'></input> </div>";
        result += "<div class='row'> <input type='submit' class='left' value='Log In' id='loginbutton'></intput>";
        result += "<input type='submit' class='right' value='Sign Up' id='signupbutton'></intput> </div>";
        result += "<div class='row'> <span class='error' id='loginerror'></span></div>";
        result += "</div>";
    }
    return result;
}

function domainSidebarBlock(){
    result = "<div class='sidebarblock'> ";
    result += "<div class='row'> Choose a domain: </div>";
    // xxx make this just a little more elegant, unless domains get scrapped really soon
    result += "<div class='row'> <select id='selectdomain'> <option>Public</opion><option>Test</option><option>Taskforce</option> </select> </div>";
    result += "</div>";
    return result;
}

function betSidebarBlock(id){
    claim = cachedClaims[id];
    result = "<div class='sidebarblock'>";
    result += "<div class='row'> Multiplier is " + claim['bounty'] + "</div>";
    if (loggedIn){
        result += "<div class='row'> Max risk is " + displayReputation(claim['maxstake']) + " * ";
        result += displayReputation(reputation) + " = " + displayReputation(claim['maxstake']* reputation) + "</div>";
    }
    result += "</div>";
    return result;
}

function loadSidebar(){
    newSidebar = "";
    if  (loggedIn){
        newSidebar += "<div class='sidebarblock'> ";
        newSidebar += "<div class='row'> You are logged in as " + user + "</div> ";
        newSidebar += "<div class='row'> You reputation is " + displayReputation(reputation) + "</div> ";
        newSidebar += "<div class='row'> <input type='submit' class='left' value='Log Out' id='logoutbutton'></input></div> ";
        newSidebar += "</div>";
    } else{
        newSidebar += "<div class='sidebarblock'> ";
        newSidebar += "<div class='row'>Username:</div> ";
        newSidebar += "<div class='row'> <input type='text' id='usernameinput'></input> </div>";
        newSidebar += "<div class='row'>Password:</div> ";
        newSidebar += "<div class='row'> <input type='password' id='passwordinput'></input> </div>";
        newSidebar += "<div class='row'> <input type='submit' class='left' value='Log In' id='loginbutton'></intput>";
        newSidebar += "<input type='submit' class='right' value='Sign Up' id='signupbutton'></intput> </div>";
        newSidebar += "<div class='row'> <span class='error' id='loginerror'></span></div>";
        newSidebar += "</div>";
    }
    if (display=='topic'){
        newSidebar += "<div class='sidebarblock'>";
        newSidebar += "<div class='row'> Multiplier is " + currentClaim['bounty'] + "</div>";
        if (loggedIn){
            newSidebar += "<div class='row'> Max risk is " + displayReputation(currentClaim['maxstake']) + " * ";
            newSidebar += displayReputation(reputation) + " = " + displayReputation(currentClaim['maxstake']* reputation) + "</div>";
        }
        newSidebar += "</div>";
    }
    if (loggedIn){
        newSidebar += "<div class='sidebarblock'> ";
        newSidebar += "<div class='row'> Choose a domain: </div>";
        newSidebar += "<div class='row'> <select id='selectdomain'> <option>Public</opion><option>Test</option><option>Taskforce</option> </select> </div>";
        newSidebar += "</div>";
    }
}

function initializeSidebar(display){
    $('#passwordinput').keypress(function(e){
        if(e.which == 13){
            $('#loginbutton').focus().click();
        }
    });
    $('#signupbutton').click(function(){
        signup($('#usernameinput').val(), $('#passwordinput').val());
    });
    $('#loginbutton').click(function(){
        login($('#usernameinput').val(), $('#passwordinput').val());
    });
    $('#logoutbutton').click(function(){
        logout();
    });
    if (display['type'] == 'displayclaim'){
        id = display['claim'];
        $('#confirm').click(function(){
            resolveBet(id, true);
        });
        $('#deny').click(function(){
            resolveBet(id, false);
        });
    }
    $('#selectdomain').val(domain);
    $('#selectdomain').change(function(){
        domain = $('#selectdomain').val();
        userstate['domain'] = domain;
        saveState();
        if (currentDisplay['type'] == 'search'){
            newDisplay = {'type':'search', 'search':domain};
        } else {
            newDisplay = currentDisplay;
        }
        changeDisplay(newDisplay);
    });
}

function setDisplay(display){
    result = display['type'];
    if (result == "displayclaim"){
        result += "+" + display['claim'];
    } else if (result == 'search'){
        result += "+" + display['search'];
    }
    window.location.hash = result;
}


function canAdministrate(id){
    claim = cachedClaims[id];
    return (user == claim['owner']);
}

function loadAccount(){
    $('#mainframe').html("This is the account page.");
}


function displayReputationChange(d){
    result = (d).toFixed(2);
    if (d > 0)  result = "+" + result;
    return result;
}

function saveState(){
        $.cookie('userstate', userstate.toSource());
}

function restoreState(){
        if ($.cookie('userstate') != null)
            userstate = eval($.cookie('userstate'));
        if ('password' in userstate) login(userstate['username'], userstate['password']);
        if ('domain' in userstate) domain=userstate['domain'];
}

function setActiveLink(name){
    $(activeLink).removeClass("activelink");
    activeLink = name;
    if (activeLink) $(activeLink).addClass("activelink");
}

function changeDisplay(newDisplay){
    if (newDisplay['type']=='default'){
        newDisplay['type'] = 'search';
        newDisplay['search'] = domain;
    }
    attemptUpdateDisplay(newDisplay);
    getData(newDisplay);
}


$(document).ready(function(){

    $(window).bind('hashchange', function(e) {
        newDisplay = fragmentDisplay();
        if (newDisplay['type'] == 'search' || newDisplay['type'] == 'default') 
            setActiveLink("#recentclaimsnavbar");
        else if (newDisplay['type'] == 'submitclaim') setActiveLink("#submitclaimnavbar");
        else setActiveLink(null);
        clearAlert();
        changeDisplay(newDisplay);
    });

    restoreState();
    $(window).trigger('hashchange');
});
