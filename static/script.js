// A display state is a dict mapping 'type' to one of 'listclaims',
// 'displayclaim', 'submitclaim' or 'listdomains'.
// It can also contain additional information about the current state.
var DEFAULT_DISPLAY = {'type':'listclaims', 'search':'user_default'};

// The user is a dict which stores a 'name', 'password', and 'reputation'.
// These values are not null if and only if the user is logged in.
// TODO: Replace user passwords with MD5 hashes or the equivalent.
function newUser() {
  return {'name':null, 'password':null, 'reputation':null};
}
var user = newUser();
function loggedIn() {
  return user.name != null
}

var currentTime = Date();
var cachedClaims = {};
var cachedSearches = {};
var cache = {};

/* -------------------------------------------------------------------------- *
 * Initialization code begins here!                                           *
 * -------------------------------------------------------------------------- */

// Saves and loads user states to a cookie.
function saveUserState() {
  $.cookie('name', user.name);
  $.cookie('password', user.password);
  $.cookie('reputation', user.reputation);
}

function restoreUserState() {
  user.name = $.cookie('name');
  user.password = $.cookie('password');
  user.reputation = parseFloat($.cookie('reputation'));
  if (user.name != null) {
    login(user.name, user.password);
  }
}

// Make the document change when the hash parameters do.
$(document).ready(function() {
  $(window).bind('hashchange', function(e) {
    displayState = getDisplayState();
    if (!updateDisplay(displayState)) {
      getDisplayData(displayState);
    }
  });

  restoreUserState();
  $(window).trigger('hashchange');
});

// Parses the current address's hash parameters to get the display state.
// Returns a display: a dict mapping 'type' to a display type, and potentially
// containing other information.
function getDisplayState() {
  paramFragment = $.param.fragment();

  if (paramFragment == '') {
    return DEFAULT_DISPLAY;
  } else {
    state = {}
    params  = paramFragment.split("+");
    state.type = params[0];
    if (state.type == 'listclaims') {
      state.search = params[1];
    } else if (state.type  == 'displayclaim' || state.type == 'submitclaim') {
      state.id = parseInt(params[1]);
    } else if (state.type != 'listdomains') {
      // Unknown state type. Show the home page.
      state = DEFAULT_DISPLAY;
    }
    return state;
  }
}

/* -------------------------------------------------------------------------- *
 * Graphics code begins here!                                                 *
 * -------------------------------------------------------------------------- */

// Update the user interface. Revert to the default display if the user attempts
// to take an action which requires him to be logged in without doing so.
// Returns false if the required data has not been cached and true otherwise.
function updateDisplay(displayState) {
  clearAlert();

  if (displayState.type == 'submitclaim' && !loggedIn()) {
    setAlert("You must be logged in to submit a claim.");
    displayState = DEFAULT_DISPLAY;
  } else if (displayState.type == 'listdomains' && !loggedIn()) {
    setAlert("You must be logged in to adjust domains.");
    displayState = DEFAULT_DISPLAY;
  }

  updateActiveLink(displayState.type);

  newSidebar = loginSidebarBlock();
  $('#sidebar').html(newSidebar);
  setSidebarInputHandlers(displayState);

  if (isCached(displayState)) {
    // Draw the sidebar.
    newSidebar = loginSidebarBlock();
    if (displayState.type == 'displayclaim') {
      claim = cachedClaims[displayState.id];
      newSidebar += betSidebarBlock(claim);
      if (user.name == claim.owner) {
        newSidebar += ownerSidebarBlock();
      }
    }
    $('#sidebar').html(newSidebar);
    setSidebarInputHandlers(displayState);

    // Draw the main frame.
    if (displayState.type == 'listclaims') {
      drawClaims(cachedSearches[displayState.search]);
    } else if (displayState.type == 'displayclaim') {
      drawClaim(cachedClaims[displayState.id]);
    } else if (displayState.type == 'submitclaim') {
      if ('id' in displayState) {
        drawSubmitClaim(displayState.id);
      } else {
        drawSubmitClaim();
      }
    } else if (displayState.type == 'listdomains') {
      drawFilters();
    }

    return true;
  }

  return false;
}

function setAlert(message){
  $('#alertbox').html(message);
  $('#alertbox').show();
}

function clearAlert(){
  $('#alertbox').hide();
}

function setLoginError(message){
  $('#loginerror').html(message);
}

function setBetError(message){
  $('#beterror').html(message);
}

function updateActiveLink(displayType) {
  $('#recentclaimsnavbar').removeClass('activeLink');
  if (displayType == 'listclaims') {
    $('#recentclaimsnavbar').addClass('activeLink');
  }

  $('#submitclaimsnavbar').removeClass('activeLink');
  if (displayType == 'submitclaims') {
    $('#submitclaimsnavbar').addClass('activeLink');
  }

  $('#filtersnavbar').removeClass('activeLink');
  if (displayType == 'listdomains') {
    $('#filtersnavbar').addClass('activeLink');
  }
}

function isCached(displayState) {
  if (displayState.type == 'listclaims') {
    return displayState.search in cachedSearches;
  } else if (displayState.type == 'displayclaim') {
    return displayState.id in cachedClaims;
  } else if (displayState.type == 'listdomains') {
    return 'alldomains' in cache && 'userdomains' in cache;
  }
  return true;
}

function drawReputation(reputation) {
  return reputation.toFixed(2);
}

// TODO: Move this code (and similar functions) to a new file. Use string
// formatting to build the HTML instead of string concatenations.
function loginSidebarBlock(){
  result = "<div class='sidebarblock'>";
  if  (loggedIn()){
    result += "<div class='row'>You are logged in as " + user.name + "</div>";
    result += "<div class='row'>You reputation is " + drawReputation(user.reputation) + "</div>";
    result += "<div class='row'><input type='submit' class='left' value='Log Out' id='logoutbutton'></input></div>";
  } else{
    result += "<div class='row'>Username:</div>";
    result += "<div class='row'><input type='text' id='usernameinput'></input></div>";
    result += "<div class='row'>Password:</div>";
    result += "<div class='row'><input type='password' id='passwordinput'></input></div>";
    result += "<div class='row'><input type='submit' class='left' value='Log In' id='loginbutton'></intput>";
    result += "<input type='submit' class='right' value='Sign Up' id='signupbutton'></intput></div>";
    result += "<div class='row'><span class='error' id='loginerror'></span></div>";
  }
  return result + "</div>";
}

function betSidebarBlock(claim) {
  result = "<div class='sidebarblock'>";
  result += "<div class='row'> Multiplier is " + claim.bounty + "</div>";
  if (loggedIn()) {
    result += "<div class='row'> Max risk is " + drawReputation(claim.maxstake) + " * ";
    result += drawReputation(user.reputation) + " = " + drawReputation(claim.maxstake*user.reputation) + "</div>";
  }
  result += "</div>";
  return result;
}

function ownerSidebarBlock(){
  result = "<div class='sidebarblock'>";
  result += "<div class='row'><a id='confirm'>Confirm This Claim.</a></div>";
  result += "<div class='row'><a id='deny'>Deny This Claim.</a></div>";
  result += "</div>";
  return result;
}

function setSidebarInputHandlers(displayState) {
  $('#passwordinput').keypress(function(e) {
    if (e.which == 13) {
      $('#loginbutton').focus().click();
    }
  });
  $('#signupbutton').click(function() {
    signup($('#usernameinput').val(), $('#passwordinput').val());
  });
  $('#loginbutton').click(function() {
    login($('#usernameinput').val(), $('#passwordinput').val());
  });
  $('#logoutbutton').click(function() {
    logout();
  });

  if (displayState.type == 'displayclaim'){
    id = displayState.id;
    $('#confirm').click(function(){
      resolveBet(id, true);
    });
    $('#deny').click(function(){
      resolveBet(id, false);
    });
    $('#delete').click(function(){
      deleteBet(id);
    });
    $('#promote').click(function(){
      promoteClaim(id, true);
    });
    $('#unpromote').click(function(){
      promoteClaim(id, false);
    });
  }
}

function drawClaims(results) {
  mainFrame = "";
  for (i = 0; i < results.length; i++){
    mainFrame += topicBox(results[i]);
  }
  $('#mainframe').html(mainFrame);

  for (i = 0; i < results.length; i++){
    $('#displaybutton' + results[i].id).click(prepareLoader(results[i].id));
    $('#displaytitle' + results[i].id).click(prepareLoader(results[i].id));
  }
}

function topicBox(claim) {
  result = "<div class='topicbox'>";
  href = "#displayclaim+" + claim.id;
  result += "<h2> <a href='" + href + "' class='betdescription' id='displaytitle" + claim.id + "'>";
  result += claim.description + "</a> </h2>";
  result += "<div class='currentbet orange'>" + drawBet(claim.currentbet) + "%</div>";
  result += "<a class='orange right' href='" + href + "' id='displaybutton" + claim.id + "'>Bet on it!</a>";
  result += '<img id="betloader' + claim.id + '" class="loading right" src="ajax-loader.gif"></img>';
  result += "<div class='betdata'>";
  result += "<div class='clear'> Last bet by " + claim.lastbetter;
  result += " " + drawDate(claim.lastbettime) + ".</div>";
  if (claim.closes) {
    result += "<div class='clear'> Bet closes " + drawDate(claim.closes) + ".</div>";
  }
  result += "<div class='clear'> Submitted by " + claim.owner + " " + drawDate(claim.age) +".</div>";
  result += "</div>";
  result += "</div>";
  result += "<hr/>";
  return result;
}

function drawBet(p) {
  return (100*p).toFixed(0);
}

function drawDate(d) {
  description = "ago";
  seconds = (currentTime - d)/1000;
  if (seconds < 0){
    seconds = -1*seconds;
    description = "from now";
  }
  minutes = Math.round(seconds/60);
  hours = Math.round(minutes/60);
  days = Math.round(hours/24);
  years = Math.round(days/365);

  if (seconds < 60) {
    result = seconds + " seconds " + description;
  } else if (minutes < 60) {
    result = minutes + " minutes " + description;
  } else if (hours < 24) {
    result = hours + " hours " + description;
  } else if (days < 1000) {
    result = days + " days " + description;
  } else {
    result = years + " years " + description;
  }
  return "<span title='" + d + "'>"+result +"</span>";
}

function prepareLoader(id) {
  return function(){
    $('#betloader' + id).css("visibility", "visible");
   }
}

function drawClaim(claim) {
  mainFrame = descriptionBox(claim);
  if (isOpen(claim)) {
    mainFrame += betBox(claim);
  } else {
    mainFrame += closedBetBox(claim);
  }

  mainFrame += "<div id='implicitrightsidebar'>";
  if (loggedIn() && !isOpen(claim)) {
    mainFrame += stakeBox();
  }
  mainFrame += historyBox(claim);
  mainFrame += "</div>";

  mainFrame += definitionBox(claim);
  $('#mainframe').html(mainFrame);
  setClaimInputHandlers(claim);
}

function isOpen(claim) {
  return !(claim.closes && claim.closes < new Date());
}

function descriptionBox(claim) {
  return "<div class='clear descriptionbox'><h1>\"" + claim.description + "\"</h1></div>";
}

function betBox(claim) {
  result = "<div class='betbox'>";
  result += "<table>";
  result += "<tr><td colspan='2'>Current Consensus:</td></tr>";
  result += "<tr><td><div id='oldbet' class='betslider'></div></td>";
  result += "<td><div id='oldbettext'>" + drawBet(claim.currentbet) +  "%</div></td></tr>";
  result += "<tr><td colspan='2'>Your Update:</td></tr>"
  result += "<tr><td><div id='newbet' class='betslider'></div></td>";
  result += "<td><div class='betvalue'> <input type='text' id='betinput'></input>%</div></td></tr>";
  result += "</table>";
  result += '<div class="row"><a id="submitbet" class="orange left">Bet on it!</a>';
  result += '<img id="betloader" class="loading left" src="ajax-loader.gif"></img></div>';
  result += '<div class="clear error" id="beterror"></div>';
  result += "</div>";
  return result;
}

function closedBetBox(claim) {
  result = "<div class='betbox'><table>";
  result += "<tr><td colspan='2'> Betting was closed on this claim " + drawDate(claim.closes) + ". </td></tr>";
  result += "<tr><td colspan='2'> The market consensus at that time: </td></tr>";
  result += "<tr><td><div id='oldbet' class='betslider'></div></td>";
  result += "<td><div id='oldbettext'>" + drawBet(claim.currentbet) +  "% </div></td></tr>";
  result += "</table></div>";
  return result;
}

function stakeBox() {
  result = "<table id='stakebox' class='center'>";
  result += "<tr><th colspan='3'><h3>Your Stake</h3></th></tr>";
  result += "<tr><td> </td> <td>True</td><td>False</td></tr>";
  result += "<tr><td>Current</td>";
  result += "<td><span id='currenttruestake' class='payoff'></span></td>";
  result += "<td><span id='currentfalsestake' class='payoff'></span></td></tr>";
  result += "<tr><td>This Bet</td>";
  result += "<td><span id='thistruestake' clas='payoff'></span></td>";
  result += "<td><span id='thisfalsestake' class='payoff'></span></td></tr>";
  result += "<tr><td> Total </td>";
  result += "<td><span id='totaltruestake' class='payoff'></span></td>";
  result += "<td><span id='totalfalsestake' class='payoff'></span></td></tr>";
  result += "</table>";
  return result;
}

function historyBox(claim) {
  result = "<table id='historybox' class='center'>";
  result += "<tr><th colspan='3'><h3>History</h3></th></tr>";
  result += "<tr class='underline'><td>Estimate</td><td>User</td><td>Time</td></tr>";

  for (i = claim.history.length - 1; i >= claim.history.length - 10 && i >= 0; i--) {
    result += (i % 2) ? "<tr class='odd'>" : "<tr class='even'>";
    result += "<td>" + drawBet(claim.history[i].probability) +" %</td>";
    result += "<td>"  + claim.history[i].user + "</td>";
    result += "<td>"  + drawDate(claim.history[i].time) + "</td></tr>"
  }

  result += "</table>";
  return result;
}

function definitionBox(claim) {
  if (claim.definition) {
    return "<div class='farleft' id='definitionbox'> <h3> Precise definition </h3>" + definition + "</div>";
  }
  return "";
}

function setClaimInputHandlers(claim) {
  $('#oldbet').slider({
    range: "min",
    disabled: true,
  });
  $('.betslider').slider({
    min: 0,
    max: 1,
    step: 0.01,
    value: [ claim.currentbet ],
    orientation: "horizontal",
    animate: "normal",
    range: "min",
  });
  setEstimate(claim.id, claim.currentbet, "");
  $('#newbet').slider({
    slide:function(event, ui) {
      setEstimate(claim.id, ui.value, "slider");
    },
  });
  $('#betinput').blur(function() {
    if (isNaN($('#betinput').val())) {
      setEstimate(claim.id, claim.currentbet, "");
    } else {
      setEstimate(claim.id, ($('#betinput').val())/100, "");
    }
  });
  $('#betinput').focus(function() {
    this.select();
  });
  $('#betinput').keyup(function() {
    setEstimate(claim.id, ($('#betinput').val())/100, "field");
  });
  $('#submitbet').click(function(){
    if (!loggedIn){
      betError("You must be logged in to bet.");
    } else if (tooCommitted(claim)){
      betError("You cannot risk that much.");
    } else if (isNaN(proposedEstimate) || proposedEstimate < 0 || proposedEstimate > 1){
      betError("Your new estimate must be a number between 0 and 1.");
    }else{
      betError("");
      submitBet(claim.id, proposedEstimate);
    }
  });
}

/* -------------------------------------------------------------------------- *
 * Code for communicating with the server begins here!                        *
 * -------------------------------------------------------------------------- */

// TODO: Make the return calls to updateDisplay run through another function
// that checks that the user has not moved to a new page by the time the AJAX
// call returns. Without this check, the user could make a request, then make
// another request, and he would be "bounced back" to an old page when the first
// request returns.
function getDisplayData(displayState) {
  returnCall = function() {
    updateDisplay(displayState);
  };

  if (displayState.type == 'listclaims') {
    queryServer({'search':displayState.search}, returnCall);
  } else if (displayState.type == 'displayclaim'){
    queryServer({'claim':id,}, returnCall);
  } else if (displayState.type == 'submitclaim') {
    queryServer({'alldomains':1}, returnCall);
  } else if (displayState.type == 'listdomains') {
    queryServer({'alldomains':1, 'userdomains':1}, returnCall);
  }
}

function queryServer(query, returnCall) {
  pingServer(query, 'query', returnCall);
}

function updateServer(update, returnCall) {
  pingServer(update, 'update', returnCall);
}

function pingServer(query, queryType, returnCall) {
  // Sanitize the query by setting the return call and then automatically
  // supplying the user's name and password if these values are not null.
  if (typeof(f) == 'undefined') {
    f = function() {};
  }
  if (!('name' in query) && user.name != null) {
    query['name'] = user.name;
    query['password'] = user.password;
  }

  console.debug(query);
  if (!('login' in query) && !('signup' in query) && !('search' in query) &&
      !('claim' in query))
    return;

  // Use a GET to do 'query' requests and a POST to do 'update's.
  request = $.get;
  if (queryType == 'update') {
    request = $.post;
  }

  request(queryType, query, function(xml) {
    console.debug(xml);
    autoParseXML(xml);
    returnCall(xml);
  }, "xml");
}

// Take in XML information returned by the server and cache any time,
// reputation, claim, search, or domain information.
function autoParseXML(xml) {
  // TODO: If the return XML contains an error, return the user to the default
  // display and alert him with the error. Check for this condition first; do
  // perform other updates if it occurs.

  // All server return calls should contain a 'currenttime' field.
  // TODO: It might be better not to update the cache if this packet has an
  // earlier date than the last processed packet. I'm not sure if this scenario
  // actually happens often, though.
  currentTime = parseDate($(xml).find('currenttime').text());

  // Read the user's reputation, if it is in the XML. Set it if it is.
  newReputation = parseFloat($(xml).find('reputation').text());
  if (!isNaN(newReputation)) {
    user.reputation = newReputation;
  }

  // Cache any claims, searches, and lists of domains found in the XML.
  $(xml).find('claim').each(function() {
    claim = parseClaimFromXML(this);
    cachedClaims[claim.id] = claim;
  });

  $(xml).find('search').each(function() {
    result = [];
    $(this).find('uid').each(function() {
      id = parseInt($(this).text());
      if (id in cachedClaims) {
        result.push(cachedClaims[id]);
      }
    });
    // Only cache the search if all of the relevant claims have been cached.
    if (result.length == $(this).find('uid').length) {
      cachedSearches[$(this).find('query').text()] = result;
    }
  });

  if ($(xml).find('alldomains').length > 0) {
    alldomains = [];
    $(xml).find('alldomains').find('domain').each(function() {
      alldomains.push($(this).text());
    });
    cache.alldomains = alldomains;
  }

  if ($(xml).find('userdomains').length > 0) {
    userdomains = [];
    $(xml).find('userdomains').find('domain').each(function() {
      userdomains.push($(this).text());
    });
    cache.userdomains = userdomains;
  }
}

// Returns a claim object, with all the relevant fields (listed below) set.
function parseClaimFromXML(xml) {
  result = {};

  result.id = parseInt($(xml).find('uid').text());
  result.age = parseDate($(xml).find('age').text());
  result.bounty = parseFloat($(xml).find('bounty').text());
  result.closes = parseDate($(xml).find('closes').text());
  result.currentbet = parseFloat($(xml).find('currentbet').text());
  result.description = $(xml).find('description').text();
  result.domain = $(xml).find('domain').text();
  result.lastbetter = $(xml).find('lastbetter').text();
  result.lastbettime = parseDate($(xml).find('lastbettime').text());
  result.maxstake = parseFloat($(xml).find('maxstake').text());
  result.owner = $(xml).find('owner').text();
  result.promoted = ($(xml).find('promoted').text() == '1');
  result.resolved = ($(xml).find('resolved').text() == '1');

  definition = $(xml).find('definition').text();
  result.definition = (definition = '') ? null : definition;

  result.history = []
  $(xml).find('history').find('bet').each(function() {
    better = $(this).find('user').text();
    probability = parseFloat($(this).find('probability').text());
    time = parseDate($(this).find('time').text());
    result.history.push({'user':better, 'probability':probability, 'time':time});
  });

  return result;
}

// TODO: This function doesn't work.
function parseDate(strDate) {
  if (strDate == 'None') {
    return null;
  }
  parts = strDate.split(/[\.\s\/:-T]/);
  return new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
}

function parseDateTime(strDate, strTime) {
  dateParts = strDate.split(/[\.\s\/:-T]/);
  timeParts = strTime.split(/[\.\s\/:-T]/);
  return new Date(dateParts[2], dateParts[0] - 1, dateParts[1], timeParts[0], timeParts[1]);
}

/* -------------------------------------------------------------------------- *
 * Logic code begins here!                                                    *
 * -------------------------------------------------------------------------- */

function login(name, password){
  queryServer({'login':1, 'name':name, 'password':password},
    function(xml) {
      result = $(xml).find('login').text();
      if (result == 'success') {
        user.name = name;
        user.password = password;
        saveUserState();
        $(window).trigger('hashchange');
      } else if (result == 'nosuchuser') {
        setLoginError('No such user.');
      } else if (result == 'wrongpassword') {
        setLoginError('Incorrect password.');
      }
    }
  );
}

function signup(name, password){
  updateServer({'signup':1, 'name':name, 'password':password},
    function(xml){
      result = $(xml).find('signup').text();
      if (result == 'success') {
        user.name = name;
        user.password = password;
        saveUserState();
        $(window).trigger('hashchange');
      } else if (result == 'usernametaken') {
        setLoginError('That username is taken.');
      } else if (result == 'shortusername') {
        setLoginError('Enter a username and password above.\nYour username must be at least 3 characters.');
      } else if (result == 'shortpassword') {
        setLoginError('Your password must be at least 3 characters.');
      }
    }
  );
}

function logout() {
  user = newUser();
  delete cache.userdomains;
  saveUserState();
  $(window).trigger('hashchange');
}

/* -------------------------------------------------------------------------- *
 * Unedited code begins here!                                                 *
 * -------------------------------------------------------------------------- */

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

function changed(display1, display2){
  if (display1['type'] != display2['type']) return true;
  else if (display1['type'] == 'displayclaim') return (display1['claim'] != display2['claim']);
  else if (display1['type'] == 'search') return (display1['search'] != display2['search']);
}

function dirtyClaim(id){
}

function dirtySearch(search){
}

function submitClaimBox(id){
  result = "<div class='submitbetbox'>";
  result += "<div class='row'>Short description:";
  result += "<input type='text' id='description' size='50' maxlength='200' </input> </div>";
  result += "<div class='row'><div class='left'>Precise definition:</div>";
  result += "<textarea id='definition'></textarea> </div>";
  result += "<div class='row'>Bounty:";
  result += "<input type='text' id='bounty' size='4' maxlength='5'></input>";
  result += "Maximum Risk (as fraction of reputation):";
  result += "<input type='text' id='maxstake' size='4' maxlength='5'></input>";
  result += "Initial Estimate:"
  result += "<input type='text' id='initialestimate' size='4' maxlength='5'></input> </div>";
  result += "<div class='row'> Market closes (optional):";
  result += "<input type='text' id='closedate'></input>";
  result += "<input type='text' id='closetime'></input> </div>";
  result += "<div class='row'> Choose an existing domain: <select id='domain'> </select>";
  result += " or create a new one: <input type='text' id='domaintext'></input></div>"
  result += "<div class='row'> <a class='orange' id='submitclaimbutton'> Submit Claim </a> </div>";
  result += "<div class='error row' id='submitclaimerror'> </div>";
  result += "</div>";
  return result;
}

function initializeSubmitClaim(id){
  submitted = false;
  claim = (typeof(id)=='undefined' || isNaN(id)) ?
    { 'description':"", 'definition':"", 'maxstake':0.5, 'currentbet':0.5,
      'bounty':1.0, 'closes':null, 'domain':'general'} : cachedClaims[id];
  closedate = humanDate(claim['closes']);
  closetime = humanTime(claim['closes']);
  $('#description').val(claim['description']);
  $('#definition').val(claim['definition']);
  $('#submitclaimbutton').click(function(){
    submitClaim(id);
  });
  $('#initialestimate').val(claim['currentbet']);
  $('#initialestimate').focus(function(){
    this.select();
  });
  $('#maxstake').val(claim['maxstake']);
  $('#maxstake').focus(function(){
    this.select();
  });
  $('#bounty').val(claim['bounty']);
  $('#bounty').focus(function(){
    this.select();
  });
  $('#closetime').val(closetime);
  $('#closetime').timepicker({});
  $('#closedate').val(closedate);
  $('#closedate').datepicker({});
  for (i = 0; i < cache['alldomains'].length; i++){
    domain = cache['alldomains'][i];
    $('#domain').append("<option value='"+domain+"'>"+domain+"</option>");
  }
  $('#domain').val(claim['domain']);
}

function submitClaim(id){
  if (submitted) return;
  proposedEstimate = $('#initialestimate').val();
  bounty = $('#bounty').val();
  maxstake = $('#maxstake').val();
  description = $('#description').val();
  definition = $('#definition').val();
  domain = $('#domaintext').val();
  if (domain=='') domain = $('#domain').val();
  closes = parseDateTime($('#closedate').val(), $('#closetime').val());
  falseRisk = bounty*Math.log(proposedEstimate);
  trueRisk = bounty*Math.log(1 - proposedEstimate);
  if (typeof(id) == 'undefined'){
    if (trueRisk < -1 * maxstake * user.reputation || falseRisk < -1 * maxstake * user.reputation){
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
      queryServer({   submitclaim:1, user:user, probability:proposedEstimate,
        maxstake:maxstake, description:description, bounty:bounty, domain:domain,
        definition:definition, domain:domain, closes:serverDate(closes) },
      function(xml){
        setDisplay(defaultDisplay);
      });
    }
  } else {
    submitted = true;
    queryServer({ editclaim:1, user:user, maxstake:maxstake, description:description,
      bounty:bounty, definition:definition, domain:domain, closes:serverDate(closes),
      topic:id, domain:domain  },
      function(xml){
        setDisplay(defaultDisplay);
      });
  }
}

function promoteClaim(id, p){
  queryServer({ promoteclaim: (p?1:0), topic:id },
    function(xml){
      setDisplay(defaultDisplay);
    });
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
  // TODO: Figure out what the hell this does.
  return false;

  if (h.length == 0) return 0;
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

function displayFilters(){
  alldomains = cache['alldomains'].slice();
  alldomains.unshift("promoted");
  for (i = 0; i < alldomains.length; i++){
    isActiveDomain[alldomains[i]] = 0;
  }
  for (i = 0; i < cache['userdomains'].length; i++){
    isActiveDomain[cache['userdomains'][i]] = 1;
  }
  newMainFrame = "<div class='domainheader'> <h1> Change Domains. </h1>";
  newMainFrame += "<div class='row'> Choose which domains to display by default, ";
  newMainFrame += "or view recent claims within a domain.</div> </div>";
  newMainFrame += "<div>";
  for (i = 0; i < alldomains.length; i++){
    newMainFrame += domainPicker(alldomains[i]);
  }
  newMainFrame += "</div>";
  $('#mainframe').html(newMainFrame);
  for (i = 0; i < alldomains.length; i++){
    $('#domain' + alldomains[i]).click(prepareDomainToggler(alldomains[i]));
  }
}

function prepareDomainToggler(domain){
  return function(){
    oldstate = isActiveDomain[domain];
    newstate = 1 - oldstate;
    isActiveDomain[domain] = newstate;
      queryServer({'newdomains':userDomains(isActiveDomain),
             'time':serverDate(new Date())});
    if (newstate){
      $('#domain' + domain).css("color","rgb(235,143,0)");
      $('#domain' + domain).animate({"font-size":"2.5em", "paddingTop":"0em",
                       "paddingTop":"0em"},200);
    } else {
      $('#domain' + domain).css("color","gray");
      $('#domain' + domain).animate({"font-size":"1.5em", "paddingBottom":"0.5em",
                       "paddingTop":"0.5em"}, 200);
      //$('#domain' + domain).removeClass("activedomain");
    }
  }
}

function userDomains(map){
  result = "";
  first = true;
  for (x in map){
    if (map[x] == 1){
      if (!first) result += " ";
      first = false;
      result += x;
    }
  }
  return result;
}

function domainPicker(domain){
  c = (isActiveDomain[domain] == 1)?"activedomain":'inactivedomain';
  result = "<div class='row'> <div class='left domainholder'><a id='domain"+domain+"' class='"+c+"'>";
  result += domain + "</a></div> <div class='right'> <a href='#search+"+domain+"'>";
  result += "(view " +domain+")</a></div> </div>";
  return result;
}

function displaySubmitClaim(id){
  $('#mainframe').html(submitClaimBox(id));
  initializeSubmitClaim(id);
}

function serverDate(d){
  month = padInt(d.getMonth() + 1);
  hour = padInt(d.getHours());
  minute = padInt(d.getMinutes());
  second = padInt(d.getSeconds());
  day = padInt(d.getDate());
  return "" + (d.getFullYear()) + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second;
}

function padInt(x, len){
  if (typeof(len) == 'undefined') len = 2;
  x = "" + x;
  while (x.length < len) x = "0" + x;
  return x;
}

function humanDate(d){
  if (d == null) return "";
  else return (padInt(d.getMonth()+ 1)) + "/" + padInt(d.getDate()) + "/" + d.getFullYear();
}

function humanTime(d){
  if (d == null) return "";
  else return padInt(d.getHours()) + ":" + padInt(d.getMinutes());
}

function setEstimate(id, newEstimate, source){
  claim = cachedClaims[id];
  proposedEstimate = newEstimate;
  // TODO: Figure out what the hell this does.
  //proposedHistory[proposedHistory.length-1]['probability'] = newEstimate;
  if (source != "slider"){
    $('#newbet').slider({
      value: [ newEstimate ],
    });
  }
  if (source != "field"){
    $('#betinput').val( drawBet(newEstimate) );
  }
  recalculateView(id);
}

function recalculateView(id){
  // TODO: Figure out what the hell this does.
  return false;

  claim = cachedClaims[id];
  currentTrueStake = getCommitment(id, claim['history'], true);
  currentFalseStake = getCommitment(id, claim['history'], false);
  totalTrueStake = getCommitment(id, proposedHistory, true);
  totalFalseStake = getCommitment(id, proposedHistory, false);
  $('#oldbettext').html(drawBet(claim['currentbet']) + "%");
  $('#currenttruestake').html(drawReputation(currentTrueStake));
  $('#currentfalsestake').html(drawReputation(currentFalseStake));
  $('#thistruestake').html(drawReputation(totalTrueStake - currentTrueStake));
  $('#thisfalsestake').html(drawReputation(totalFalseStake - currentFalseStake));
  $('#totaltruestake').html(drawReputation(totalTrueStake));
  $('#totalfalsestake').html(drawReputation(totalFalseStake));
  if (totalTrueStake < -1 * claim['bounty'] * user.reputation) {
    $('#totaltruestake').addClass('error');
  } else{
    $('#totaltruestake').removeClass('error');
  }
  if (totalFalseStake < -1 * claim['bounty'] * user.reputation) {
    $('#totalfalsestake').addClass('error');
  } else{
    $('#totalfalsestake').removeClass('error');
  }
}

function tooCommitted(claim){
  id = claim.id;
  if (isNaN(getCommitment(id, proposedHistory, true)) || isNaN(getCommitment(id, proposedHistory, false))) return true;
  return (getCommitment(id, proposedHistory, true) < -1 * claim['maxstake'] * user.reputation || getCommitment(id, proposedHistory, false) < -1 * claim['maxstake'] * user.reputation);
}



function submitBet(id, bet){
      $('#betloader').css("visibility", "visible");
      claim = cachedClaims[id];
      queryServer({'makebet':1, 'user':user, 'topic':claim['id'], 'probability':bet, 'lastbettime':serverDate(claim['lastbettime'])},
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

function deleteBet(id){
  queryServer({'topic':id, 'deletebet':1, 'search':'user_default'},
    function(xml){
      setDisplay(defaultDisplay);
    });
}

function resolveBet(id, outcome){
  queryServer({'topic':id, 'resolvebet':1, 'outcome':outcome, 'search':'user_default'},
    function(xml){
      setDisplay(defaultDisplay);
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


function owner(id){
  claim = cachedClaims[id];
  return (user == claim['owner']);
}

function loadAccount(){
  $('#mainframe').html("This is the account page.");
}


function drawReputationChange(d){
  result = (d).toFixed(2);
  if (d > 0)  result = "+" + result;
  return result;
}

function changeDisplay(newDisplay){
  attemptUpdateDisplay(newDisplay);
  getData(newDisplay);
}
