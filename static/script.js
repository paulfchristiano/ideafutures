// A display state is a dict mapping 'type' to one of 'listclaims',
// 'displayclaim', 'submitclaim' or 'listdomains'.
// It can also contain additional information about the current state.
var DEFAULT_DISPLAY = {'type':'listclaims', 'search':'user_default'};

// The user is a dict which stores a 'name', 'password', and 'reputation'.
// These values are not null if and only if the user is logged in.
// TODO: Replace user passwords with MD5 hashes or the equivalent.
function newUser() {
  return {'name':null, 'password':null, 'reputation':null, 'committed':null};
}
var user = newUser();
function loggedIn() {
  return user.name != null
}

var currentTime = Date();
function newCache() {
  return {'claims':{}, 'searches':{}};
}
var cache = newCache();
var dirty = newCache();

/* -------------------------------------------------------------------------- *
 * Initialization code begins here!                                           *
 * -------------------------------------------------------------------------- */

// Saves and loads user states to a cookie.
function saveUserState() {
  $.cookie('name', user.name);
  $.cookie('password', user.password);
  $.cookie('reputation', user.reputation);
  $.cookie('committed', user.committed);
}

function restoreUserState() {
  user.name = $.cookie('name');
  user.password = $.cookie('password');
  user.reputation = parseFloat($.cookie('reputation'));
  user.committed = parseFloat($.cookie('committed'));
  if (user.name != null) {
    login(user.name, user.password);
  }
}

// Make the document change when the hash parameters do.
$(document).ready(function() {
  $(window).bind('hashchange', function(e) {
    displayState = getDisplayState();
    updateDisplay(displayState);
    getDisplayData(displayState);
  });

  restoreUserState();
  $(window).trigger('hashchange');
});

// Parses the current address's hash parameters to get the display state.
// Returns a display: a dict mapping 'type' to a display type, and potentially
// containing other information.
function getDisplayState() {
  var paramFragment = $.param.fragment();

  if (paramFragment == '') {
    return DEFAULT_DISPLAY;
  } else {
    var state = {}
    var params  = paramFragment.split("+");
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

  $('#sidebar').html(loginSidebarBlock);
  setSidebarInputHandlers(DEFAULT_DISPLAY);

  if (isCached(displayState)) {
    // Draw the sidebar.
    var newSidebar = loginSidebarBlock();
    if (displayState.type == 'displayclaim') {
      var claim = cache.claims[displayState.id];
      newSidebar += betSidebarBlock(claim);
      if (user.name == claim.owner) {
        newSidebar += ownerSidebarBlock();
      }
      // TODO: Restore the adminSidebarBlock, which allows the administrator
      // to promote or unpromote claims.
    }
    $('#sidebar').html(newSidebar);
    setSidebarInputHandlers(displayState);

    // Draw the main frame.
    if (displayState.type == 'listclaims') {
      drawClaims(cache.searches[displayState.search]);
    } else if (displayState.type == 'displayclaim') {
      drawClaim(cache.claims[displayState.id]);
    } else if (displayState.type == 'submitclaim') {
      if ('id' in displayState) {
        drawSubmitClaim(displayState.id);
      } else {
        drawSubmitClaim();
      }
    } else if (displayState.type == 'listdomains') {
      drawFilters();
    }
  }
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

function clearBetError(message){
  $('#beterror').html('');
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
    return displayState.search in cache.searches;
  } else if (displayState.type == 'displayclaim') {
    return displayState.id in cache.claims;
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
  var result = "<div class='sidebarblock'>";
  if  (loggedIn()){
    result += "<div class='row'>You are logged in as " + user.name + "</div>";
    result += "<div class='row'>You reputation is " + drawReputation(user.reputation) + "</div>";
    result += "<div class='row'>You have committed " + drawReputation(user.committed) + " points</div>";
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
  var result = "<div class='sidebarblock'>";
  result += "<div class='row'>Multiplier is " + claim.bounty + "</div>";
  if (loggedIn()) {
    var stakes = getStakes(claim, 0.5);
    var otherStake = user.committed + Math.min(stakes.old[0], stakes.old[1]);
    result += "<div class='row'>Max risk is ";
    result += drawReputation(claim.maxstake * (user.reputation - otherStake)) + "</div>";
  }
  result += "</div>";
  return result;
}

function ownerSidebarBlock(){
  var result = "<div class='sidebarblock'>";
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
  var mainFrame = "";
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
  var result = "<div class='topicbox'>";
  var href = "#displayclaim+" + claim.id;
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
  result += "<hr>";
  return result;
}

function drawBet(p) {
  return (100*p).toFixed(0);
}

function drawDate(d) {
  var description = "ago";
  var seconds = (currentTime - d)/1000;
  if (seconds < 0){
    seconds = -1*seconds;
    description = "from now";
  }
  var minutes = Math.round(seconds/60);
  var hours = Math.round(minutes/60);
  var days = Math.round(hours/24);
  var years = Math.round(days/365);

  var result;
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
  var mainFrame = descriptionBox(claim);
  if (isOpen(claim)) {
    mainFrame += betBox(claim);
  } else {
    mainFrame += closedBetBox(claim);
  }

  mainFrame += "<div id='implicitrightsidebar'>";
  if (loggedIn() && isOpen(claim)) {
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
  var result = "<div class='betbox'>";
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
  var result = "<div class='betbox'><table>";
  result += "<tr><td colspan='2'> Betting was closed on this claim " + drawDate(claim.closes) + ". </td></tr>";
  result += "<tr><td colspan='2'> The market consensus at that time: </td></tr>";
  result += "<tr><td><div id='oldbet' class='betslider'></div></td>";
  result += "<td><div id='oldbettext'>" + drawBet(claim.currentbet) +  "% </div></td></tr>";
  result += "</table></div>";
  return result;
}

function stakeBox() {
  var result = "<table id='stakebox' class='center'>";
  result += "<tr><th colspan='3'><h3>Your Stake</h3></th></tr>";
  result += "<tr><td> </td> <td>True</td><td>False</td></tr>";
  result += "<tr><td>Current</td>";
  result += "<td><span id='currenttruestake' class='payoff'></span></td>";
  result += "<td><span id='currentfalsestake' class='payoff'></span></td></tr>";
  result += "<tr><td>This Bet</td>";
  result += "<td><span id='thistruestake' class='payoff'></span></td>";
  result += "<td><span id='thisfalsestake' class='payoff'></span></td></tr>";
  result += "<tr><td> Total </td>";
  result += "<td><span id='totaltruestake' class='payoff'></span></td>";
  result += "<td><span id='totalfalsestake' class='payoff'></span></td></tr>";
  result += "</table>";
  return result;
}

function historyBox(claim) {
  var result = "<table id='historybox' class='center'>";
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
  // Set slider ranges.
  $('#oldbet').slider({
    range: "min",
    disabled: true
  });
  $('.betslider').slider({
    min: 0,
    max: 1,
    step: 0.01,
    value: [claim.currentbet],
    orientation: "horizontal",
    animate: "normal",
    range: "min"
  });

  // Recalculate the user's bet now and whenever he moves the slider.
  setEstimate(claim, claim.currentbet, "");

  $('#newbet').slider({
    slide:function(event, ui) {
      setEstimate(claim, ui.value, "slider");
    },
  });
  $('#betinput').blur(function() {
    if (isNaN($('#betinput').val())) {
      setEstimate(claim, claim.currentbet, "");
    } else {
      setEstimate(claim, ($('#betinput').val())/100, "");
    }
  });
  $('#betinput').focus(function() {
    this.select();
  });
  $('#betinput').keyup(function() {
    setEstimate(claim, ($('#betinput').val())/100, "field");
  });

  $('#submitbet').click(function() {
    submitBet(claim, $('#betinput').val()/100);
  });
}

/* -------------------------------------------------------------------------- *
 * Code for communicating with the server begins here!                        *
 * -------------------------------------------------------------------------- */

function getDisplayData(displayState) {
  var returnCall = function() {
    var newDisplayState = getDisplayState();
    if (displayState.type != newDisplayState.type ||
        displayState.search != newDisplayState.search ||
        displayState.id != newDisplayState.id) {
      return;
    }

    if (isDirty(displayState)) {
      updateDisplay(displayState);
    }
    dirty = newCache();
  };

  if (displayState.type == 'listclaims') {
    queryServer({'search':displayState.search}, returnCall);
  } else if (displayState.type == 'displayclaim'){
    queryServer({'claim':displayState.id}, returnCall);
  } else if (displayState.type == 'submitclaim') {
    queryServer({'alldomains':1}, returnCall);
  } else if (displayState.type == 'listdomains') {
    queryServer({'alldomains':1, 'userdomains':1}, returnCall);
  }
}

function isDirty(displayState) {
  if (displayState.type == 'listclaims') {
    return displayState.search in dirty.searches;
  } else if (displayState.type == 'displayclaim') {
    return displayState.id in dirty.claims;
  } else if (displayState.type == 'listfilters') {
    return 'alldomains' in dirty;
  }
  return false;
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
  if (typeof(returnCall) == 'undefined') {
    returnCall = function() {};
  }
  if (!('name' in query) && user.name != null) {
    query['name'] = user.name;
    query['password'] = user.password;
  }

  if (!('login' in query) && !('signup' in query) && !('search' in query) &&
      !('claim' in query))
    return;

  // Use a GET to do 'query' requests and a POST to do 'update's.
  var request = $.get;
  if (queryType == 'update') {
    request = $.post;
  }

  request(queryType, query, function(xml) {
    console.debug(xml);
    autoParseXML(xml);
    returnCall(xml);
  }, 'xml');
}

// Take in XML information returned by the server and cache any time,
// reputation, claim, search, or domain information.
function autoParseXML(xml) {
  // TODO: If the return XML contains an error, return the user to the default
  // display and alert him with the error. Check for this condition first; do
  // perform other updates if it occurs.

  // All server return calls should contain a 'currenttime' field.
  currentTime = parseDate($(xml).find('currenttime').text());

  parseUserFromXML(xml);

  // Cache any claims, searches, and lists of domains found in the XML.
  $(xml).find('claim').each(function() {
    cacheClaim(parseClaimFromXML(this));
  });

  $(xml).find('search').each(function() {
    var result = [];
    $(this).find('uid').each(function() {
      var id = parseInt($(this).text());
      if (id in cache.claims) {
        result.push(cache.claims[id]);
      }
    });
    // Only cache the search if all of the relevant claims have been cached.
    if (result.length == $(this).find('uid').length) {
      cacheSearch($(this).find('query').text(), result);
    }
  });

  // TODO: Add dirty logic here.
  if ($(xml).find('alldomains').length > 0) {
    var alldomains = [];
    $(xml).find('alldomains').find('domain').each(function() {
      alldomains.push($(this).text());
    });
    cache.alldomains = alldomains;
  }

  if ($(xml).find('userdomains').length > 0) {
    var userdomains = [];
    $(xml).find('userdomains').find('domain').each(function() {
      userdomains.push($(this).text());
    });
    cache.userdomains = userdomains;
  }
}

// Sets the user's fields with data from the xml.
function parseUserFromXML(xml) {
  $(xml).find('user').each(function() {
    var newReputation = parseFloat($(this).find('reputation').text());
    if (!isNaN(newReputation)) {
      user.reputation = newReputation;
    }
    var newCommitted = parseFloat($(this).find('committed').text());
    if (!isNaN(newCommitted)) {
      user.committed = newCommitted;
    }
  });
}

// Returns a claim object, with all the relevant fields (listed below) set.
function parseClaimFromXML(xml) {
  var result = {};

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

  result.version = parseInt($(xml).find('version').text());

  return result;
}

function parseDate(strDate) {
  if (strDate == 'None') {
    return null;
  }
  var parts = strDate.split(/[\.\s\/:\-T]/);
  return new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
}

function parseDateTime(strDate, strTime) {
  var dateParts = strDate.split(/[\.\s\/:\-T]/);
  var timeParts = strTime.split(/[\.\s\/:\-T]/);
  return new Date(dateParts[2], dateParts[0] - 1, dateParts[1], timeParts[0], timeParts[1]);
}

function cacheClaim(claim) {
  if (!(claim.id in cache.claims) || claim.version != cache.claims[id].version) {
    dirty.claims[claim.id] = true;
  }
  cache.claims[claim.id] = claim;
}

function cacheSearch(query, results) {
  if (!(query in cache.searches) ||
      (results.length != cache.searches[query].length)) {
    dirty.searches[query] = true;
  } else {
    for (i = 0; i < results.length; i++) {
      if (results[i].id != cache.searches[query][i].id) {
        dirty.searches[query] = true;
      }
    }
  }
  cache.searches[query] = results;
}

/* -------------------------------------------------------------------------- *
 * User commands code begins here!                                            *
 * -------------------------------------------------------------------------- */

function login(name, password){
  queryServer({'login':1, 'name':name, 'password':password},
    function(xml) {
      var result = $(xml).find('login').text();
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
      var result = $(xml).find('signup').text();
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
 * Betting logic begins here!                                                 *
 * -------------------------------------------------------------------------- */

function setEstimate(claim, bet, source) {
  if (!loggedIn() || isNaN(bet) || bet < 0 || bet > 1) {
    return;
  }

  if (source != 'slider') {
    $('#newbet').slider({value: [bet]});
  }
  if (source != 'field') {
    $('#betinput').val(drawBet(bet));
  }

  recalculateView(claim, bet);
}

function recalculateView(claim, bet) {
  // Refresh the old bet slider.
  $('#oldbet').slider({value: [claim.currentbet]});
  $('#oldbettext').html(drawBet(claim.currentbet) + "%");

  // Refresh the stake box.
  var stakes = getStakes(claim, bet);
  $('#currentfalsestake').html(drawReputation(stakes.old[0]));
  $('#currenttruestake').html(drawReputation(stakes.old[1]));
  $('#thisfalsestake').html(drawReputation(stakes.cur[0] - stakes.old[0]));
  $('#thistruestake').html(drawReputation(stakes.cur[1] - stakes.old[1]));
  $('#totalfalsestake').html(drawReputation(stakes.cur[0]));
  $('#totaltruestake').html(drawReputation(stakes.cur[1]));

  var otherStake = user.committed - Math.min(stakes.old[0], stakes.old[1]);
  if (-stakes.cur[0] > claim.maxstake * (user.reputation - otherStake)) {
    $('#totalfalsestake').addClass('error');
  } else{
    $('#totalfalsestake').removeClass('error');
  }
  if (-stakes.cur[1] > claim.maxstake * (user.reputation - otherStake)) {
    $('#totaltruestake').addClass('error');
  } else{
    $('#totaltruestake').removeClass('error');
  }
}

function getStakes(claim, bet) {
  // Create a new history in which the user bet 'bet' on this claim.
  var newHistory = jQuery.extend([], claim.history);
  newHistory.push({'user':user.name, 'probability':bet, 'time':new Date()});

  // Calculate the amount the user is betting on this claim.
  return {'old': {0: getStake(claim, claim.history, false),
                  1: getStake(claim, claim.history, true)},
          'cur': {0: getStake(claim, newHistory, false),
                  1: getStake(claim, newHistory, true)}};
}

function getStake(claim, newHistory, outcome) {
  if (newHistory.length == 0) {
    return 0;
  }

  var result = 0;
  var p = 1;

  for (i = 0; i < newHistory.length; i++) {
    var nextP = newHistory[i].probability;
    if (!outcome) {
      nextP = 1 - nextP;
    }
    if (user.name == newHistory[i].user) {
      result += claim.bounty * (Math.log(nextP) - Math.log(p));
    }
    p = nextP;
  }

  return result;
}

function submitBet(claim, bet){
  if (!validateBet(claim, bet)) {
    return;
  }

  $('#betloader').css("visibility", "visible");
  queryServer({'makebet':1, 'user':user, 'topic':claim['id'], 'probability':bet, 'lastbettime':serverDate(claim['lastbettime'])},
  function(xml){
    $('#betloader').css("visibility", "hidden");
    var response = $(xml).find('makebet').find('response').text();
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

// Returns true if the user can place this bet, and false otherwise.
function validateBet(claim, bet) {
  if (!loggedIn()) {
    setBetError('You must be logged in to bet.');
    return false;
  } else if (isNaN(bet) || bet < 0 || bet > 1) {
    setBetError('Your new estimate must be a number between 0 and 1.');
    return false;
  }

  var stakes = getStakes(claim, bet);
  var otherStake = user.committed - Math.min(stakes.old[0], stakes.old[1]);
  var newStake = -Math.min(stakes.cur[0], stakes.cur[1]);
  if (isNaN(newStake) ||
      newStake > claim.maxstake * (user.reputation - otherStake)) {
    setBetError('You cannot risk that much on one bet.');
    return false;
  }

  setBetError('Valid bet.');
  return true;
}

/* -------------------------------------------------------------------------- *
 * Unedited code begins here!                                                 *
 * -------------------------------------------------------------------------- */

function submitClaimBox(id){
  var result = "<div class='submitbetbox'>";
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
  var submitted = false;
  var claim = (typeof(id)=='undefined' || isNaN(id)) ?
    { 'description':"", 'definition':"", 'maxstake':0.5, 'currentbet':0.5,
      'bounty':1.0, 'closes':null, 'domain':'general'} : cache.claims[id];
  var closedate = humanDate(claim['closes']);
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
  var proposedEstimate = $('#initialestimate').val();
  var bounty = $('#bounty').val();
  var maxstake = $('#maxstake').val();
  var description = $('#description').val();
  var definition = $('#definition').val();
  var domain = $('#domaintext').val();
  if (domain=='') domain = $('#domain').val();
  var closes = parseDateTime($('#closedate').val(), $('#closetime').val());
  var falseRisk = bounty*Math.log(proposedEstimate);
  var trueRisk = bounty*Math.log(1 - proposedEstimate);
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

function displayFilters(){
  alldomains = cache['alldomains'].slice();
  alldomains.unshift("promoted");
  for (i = 0; i < alldomains.length; i++){
    isActiveDomain[alldomains[i]] = 0;
  }
  for (i = 0; i < cache['userdomains'].length; i++){
    isActiveDomain[cache['userdomains'][i]] = 1;
  }
  var newMainFrame = "<div class='domainheader'> <h1> Change Domains. </h1>";
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
  var month = padInt(d.getMonth() + 1);
  var hour = padInt(d.getHours());
  var minute = padInt(d.getMinutes());
  var second = padInt(d.getSeconds());
  var day = padInt(d.getDate());
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
