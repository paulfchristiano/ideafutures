// A display state is a object mapping 'type' to one of 'listclaims',
// 'displayclaim', 'submitclaim' or 'settings', or 'invite'.
// It must provide the following methods:
//   setDisplayState:
//     Sets the window hash appropriately.
//   isForbidden:
//     Returns either false or an error string.
//   draw:
//     Draws the display in the main box and sidebar.
//   updateActiveLink:
//     Sets the active link in the navbar to 'active'.
//   getDisplayData:
//     Requests the necessary data from the server.
//   isCached and isDirty:
//     Checks the condition of the required data in the cache.
// The default page is a search with the user's default tags.
function ListClaims(search, extra) {
  this.type = 'listclaims';
  this.search = search;
  this.extra = extra;
  this.query = encodeURIComponent(this.search);
  if (extra) {
    this.query += '+' + encodeURIComponent(this.extra);
  }
  this.setDisplayState = function() {
    window.location.hash = this.type + '+' + this.query;
  };
  this.isForbidden = function() {
    if (this.extra == 'my_bets' && !loggedIn()) {
      return 'You must log in to see claims you have bet on.';
    }
    return false;
  };
  this.draw = function() {
    drawClaims(cache.searches[this.query]);
  };
  this.updateActiveLink = function() {
    if (this.extra == 'my_bets') {
      $('#mybetsnavlink').addClass('activeLink');
    } else if (this.extra == 'default') {
      $('#recentclaimsnavlink').addClass('activeLink');
    }
  };
  this.getDisplayData = function(returnCall) {
    if (extra) {
      queryServer({'search':this.search, 'extra':this.extra}, returnCall);
    } else {
      queryServer({'search':this.search}, returnCall);
    }
  };
  this.isCached = function() {
    return this.query in cache.searches;
  };
  this.isDirty = function() {
    return this.query in dirty.searches;
  };
}

var DEFAULT_DISPLAY = new ListClaims('', 'default');
var TITLE = 'Reputation-based prediction market';

function DisplayClaim(id) {
  this.type = 'displayclaim';
  this.id = id;
  this.setDisplayState = function() {
    window.location.hash = this.type + '+' + encodeURIComponent(this.id);
  };
  this.isForbidden = function() {
    if (!loggedIn() && this.id in cache.claims) {
      return (cache.claims[this.id].groups[0] != 'all' && 'This claim has restricted visibility.');
    }
    return false;
  };
  this.draw = function() {
    drawClaim(cache.claims[this.id]);
  };
  this.updateActiveLink = function() {};
  this.getDisplayData = function(returnCall) {
    queryServer({'claim':this.id}, returnCall);
  };
  this.isCached = function() {
    return this.id in cache.claims;
  };
  this.isDirty = function() {
    return this.id in dirty.claims;
  };
}

function SubmitClaim() {
  this.type = 'submitclaim';
  this.setDisplayState = function() {
    window.location.hash = this.type;
  };
  this.isForbidden = function() {
    return (!loggedIn() && "You must be logged in to submit a claim.");
  };
  this.draw = function() {
    drawSubmitClaim();
  };
  this.updateActiveLink = function() {
    $('#submitclaimnavlink').addClass('activeLink');
  };
  this.getDisplayData = function(returnCall) {
    queryServer({'alltags':1, 'settings': 1}, returnCall);
  };
  this.isCached = function() {
    return 'alltags' in cache && 'settings' in cache;
  };
  this.isDirty = function() {
    return 'alltags' in dirty || 'settings' in dirty;
  };
}

function EditClaim(id) {
  this.type = 'editclaim';
  this.id = id;
  this.setDisplayState = function() {
    window.location.hash = this.type + '+' + encodeURIComponent(this.id);
  };
  this.isForbidden = function() {
    return (!isAdmin() && "You must be an admin to edit a claim.");
  };
  this.draw = function() {
    drawSubmitClaim(cache.claims[this.id]);
  };
  this.updateActiveLink = function() {};
  this.getDisplayData = function(returnCall) {
    queryServer({'alltags':1, 'settings': 1, 'claim':this.id}, returnCall);
  };
  this.isCached = function() {
    return 'alltags' in cache && 'settings' in cache && this.id in cache.claims;
  };
  this.isDirty = function() {
    return 'alltags' in dirty || 'settings' in dirty || this.id in cache.claims;
  };
}

function Settings() {
  this.type = 'settings';
  this.setDisplayState = function() {
    window.location.hash = this.type;
  };
  this.isForbidden = function() {
    return (!loggedIn() && "You must log in to change your account settings.");
  };
  this.draw = function() {
    drawSettings(cache.alltags, cache.settings);
  };
  this.updateActiveLink = function() {
    $('#settingsnavlink').addClass('activeLink');
  };
  this.getDisplayData = function(returnCall) {
    queryServer({'alltags':1, 'settings': 1}, returnCall);
  };
  this.isCached = function() {
    return 'alltags' in cache && 'settings' in cache;
  };
  this.isDirty = function() {
    return 'alltags' in dirty || 'settings' in dirty;
  };
}

function Invite(group_name, invite, hash) {
  this.type = 'invite';
  this.group_name = group_name;
  this.invite = invite;
  this.hash = hash;
  this.setDisplayState = function() {
    window.location.hash = (
      this.type + '+' +
      encodeURIComponent(this.group_name) + '+' +
      encodeURIComponent(this.invite) + '+' +
      encodeURIComponent(this.hash)
    );
  };
  this.isForbidden = function() {
    return false;
  };
  this.draw = function() {
    drawInvite(cache.invites[this.group_name]);
  };
  this.updateActiveLink = function() {
  };
  this.getDisplayData = function(returnCall) {
    queryServer({
      'group_name': this.group_name,
      'invite': this.invite,
      'group_hash': this.hash,
    }, returnCall);
  };
  this.isCached = function() {
    return this.group_name in cache.invites;
  };
  this.isDirty = function() {
    return this.group_name in dirty.invites;
  };
}

function Scores() {
  this.type = 'scores';
  this.setDisplayState = function() {
    window.location.hash = this.type;
  };
  this.isForbidden = function() {
    return false;
  };
  this.draw = function() {
    drawScores(cache.scores);
  };
  this.updateActiveLink = function() {
    $('#scoresnavlink').addClass('activeLink');
  };
  this.getDisplayData = function(returnCall) {
    queryServer({'scores': 1}, returnCall);
  };
  this.isCached = function() {
    return 'scores' in cache;
  };
  this.isDirty = function() {
    return 'scores' in dirty;
  };
}

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

var DEFAULT_BOUNTY = 1.44;
var DEFAULT_MAXSTAKE = 0.1;
var RESTRICTED_TAGS = [];

var alertNum = 0;
var currentTime = new Date();
function newCache() {
  return {'claims':{}, 'searches':{}, 'invites':{}};
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
    var displayState = getDisplayState();
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
    var params  = paramFragment.split("+");
    if (params[0] == 'listclaims') {
      if (params.length > 2) {
        return new ListClaims(decodeURIComponent(params[1]), decodeURIComponent(params[2]));
      } else {
        return new ListClaims(decodeURIComponent(params[1]));
      }
    } else if (params[0]  == 'displayclaim') {
      return new DisplayClaim(parseInt(decodeURIComponent(params[1]), 10));
    } else if (params[0] == 'submitclaim') {
      return new SubmitClaim();
    } else if (params[0] == 'editclaim') {
      return new EditClaim(parseInt(decodeURIComponent(params[1]), 10));
    } else if (params[0] == 'settings') {
      return new Settings();
    } else if (params[0] == 'invite') {
      return new Invite(
        decodeURIComponent(params[1]),
        decodeURIComponent(params[2]),
        decodeURIComponent(params[3])
      );
    } else if (params[0] == 'scores') {
      return new Scores();
    } else {
      // Unknown state type. Show the home page.
      return DEFAULT_DISPLAY;
    }
  }
}

// Returns true if the given display state is the current state.
function isCurrentDisplay(displayState) {
  var newDisplayState = getDisplayState();
  return displayState.type == newDisplayState.type &&
      displayState.query == newDisplayState.query &&
      displayState.id == newDisplayState.id;
}

/* -------------------------------------------------------------------------- *
 * Graphics code begins here!                                                 *
 * -------------------------------------------------------------------------- */

// Update the user interface. Revert to the default display if the user attempts
// to take an action which requires him to be logged in without doing so.
function updateDisplay(displayState) {
  var forbidden = displayState.isForbidden();
  if (forbidden) {
    setAlert(forbidden);
    history.go(-1);
    return;
  }

  if (displayState.isCached()) {
    updateActiveLink(displayState);

    var newSidebar = loginSidebarBlock();
    if (displayState.type == 'displayclaim') {
      var claim = cache.claims[displayState.id];
      if (isAdmin()) {
        newSidebar += adminSidebarBlock(claim);
      }
    }
    $('#sidebar').html(newSidebar);
    setSidebarInputHandlers(displayState);

    $('#search').val(displayState.search || '');
    displayState.draw();
  }
}

function setAlert(message) {
  alertNum += 1;
  $('#alertbox').css({'opacity': 0});
  $('#alertbox').html(message);
  $('#alertbox').css({'margin-left': 358 - $('#alertbox').width()/2});
  $('#alertbox').show();
  $('#alertbox').animate({'opacity': 1}, {
    duration: 200,
    queue: false,
    complete: function(oldAlertNum) {
      return function() {
        if (alertNum > oldAlertNum) {
          return;
        }
        $('#alertbox').animate({'opacity': 1}, {
          duration: 1600,
          queue: false,
          complete: function(oldAlertNum) {
            return function() {
              if (alertNum > oldAlertNum) {
                return;
              }
              $('#alertbox').animate({'opacity': 0}, {
                duration: 200,
                queue: false,
                complete: function(oldAlertNum) {
                  return function() {
                    if (alertNum == oldAlertNum) {
                      $('#alertbox').hide();
                    }
                  };
                } (oldAlertNum),
              });
            };
          } (oldAlertNum),
        });
      };
    } (alertNum),
  });
}

function setLoginError(message) {
  $('#loginerror').html(message);
}

function setSignupError(message) {
  $('#signuperror').html(message);
}

function clearSignupError() {
  $('#signuperror').html('');
}

function setBetError(message) {
  $('#beterror').html(message);
}

function clearBetError() {
  $('#beterror').html('');
}

function setClaimError(message) {
  $('#submitclaimerror').html(message);
}

function clearClaimError(str) {
  $('#submitclaimerror').html('');
}

function setGroupError(message) {
  $('#group-error').html(message);
}

function clearGroupError() {
  $('#group-error').html('');
}

function setInviteError(message) {
  $('#resolve-invite-error').html(message);
}

function clearInviteError() {
  $('#resolve-invite-error').html('');
}

function updateActiveLink(displayState) {
  $('#recentclaimsnavlink').removeClass('activeLink');
  $('#submitclaimnavlink').removeClass('activeLink');
  $('#settingsnavlink').removeClass('activeLink');
  $('#mybetsnavlink').removeClass('activeLink');
  $('#scoresnavlink').removeClass('activeLink');
  displayState.updateActiveLink();
}

function drawReputation(reputation) {
  return reputation.toFixed(2);
}

function html_encode(str) {
  return $('<div/>').text(str).html();
}

// TODO: Move this code (and similar functions) to a new file. Use string
// formatting to build the HTML instead of string concatenations.
function loginSidebarBlock(){
  var result = "<div class='sidebarblock'>";
  if  (loggedIn()){
    result += "<div class='row'>Logged in as " + user.name + ".</div>";
    result += "<div class='row'>Reputation: " + drawReputation(user.reputation) + "</div>";
    result += "<div class='row'>(Free: " + drawReputation(user.reputation - user.committed) + ")</div>";
    result += "<div class='row'><input type='submit' class='left' value='Log out' id='logoutbutton'></input></div>";
  } else{
    result += "<div class='row'>Username:</div>";
    result += "<div class='row'><input type='text' id='login-username'></input></div>";
    result += "<div class='row'>Password:</div>";
    result += "<div class='row'><input type='password' id='login-password'></input></div>";
    result += "<div class='row'><input type='submit' class='left' value='Log in' id='loginbutton'></intput>";
    result += "<input type='submit' class='right' value='Sign up' id='signupbutton'></intput></div>";
    result += "<div class='row'><span class='error' id='loginerror'></span></div>";
  }
  return result + "</div>";
}

function isAdmin() {
  return user.name == 'paulfchristiano' || user.name == 'skishore';
}

function adminSidebarBlock(claim) {
  var result = "<div class='sidebarblock'>";
  if (claim.resolved) {
    result += "<div class='row'><a id='reopen'>Re-open this claim.</a></div>";
  } else {
    result += '<div class="row">';
    result += '<a href="#editclaim+' + encodeURIComponent(claim.id) + '">Edit this claim.</a>';
    result += '</div>';
    result += "<div class='row'><a id='delete'>Delete this claim.</a></div>";
  }
  result += "</div>";
  return result;
}

function setSidebarInputHandlers(displayState) {
  if (loggedIn()) {
    $('#logoutbutton').click(function() {
      logout();
    });
  } else {
    $('#login-password').keypress(function(e) {
      if (e.which == 13) {
        $('#loginbutton').focus().click();
      }
    });
    $('#loginbutton').click(function() {
      login($('#login-username').val(), $('#login-password').val());
    });

    $('#signupbutton').click(function() {
      $('#signup-dialog').find('form').find('input').each(function() {
        $(this).val('');
      });
      clearSignupError();
      $('#signup-dialog').dialog('open');
    });
  }

  if (displayState.type == 'displayclaim'){
    id = displayState.id;
    $('#reopen').click(function() {
      reopenClaim(id);
    });
    $('#promote').click(function() {
      promoteClaim(id, true);
    });
    $('#unpromote').click(function() {
      promoteClaim(id, false);
    });
    $('#delete').click(function() {
      deleteClaim(id);
    });
  }
}

function drawClaims(results) {
  if (results.length == 0) {
    var mainFrame = "<div class='header'><h1>No claims found.</h1>";
    mainFrame += "<div class='row'>No claims match your current search.";
    if (loggedIn()) {
      mainFrame += " Try another search or ";
      mainFrame += " <a href=\"#submitclaim\">submit a claim</a>.";
    } else {
      mainFrame += " Try another search or log in to submit a claim.";
    }
    mainFrame += "</div></div>";
    $('#mainframe').html(mainFrame);
    return;
  }

  var mainFrame = "";
  for (var i = 0; i < results.length; i++){
    mainFrame += topicBox(results[i]);
  }
  $('#mainframe').html(mainFrame);

  for (var i = 0; i < results.length; i++){
    $('#displaybutton' + results[i].id).click(prepareLoader(results[i].id));
    $('#displaytitle' + results[i].id).click(prepareLoader(results[i].id));
  }
}

function topicBox(claim) {
  var lastBet = claim.history[claim.history.length - 1];
  var href = "#displayclaim+" + encodeURIComponent(claim.id);
  var result = "<div class='topicbox'><h2>";
  if (claim.resolved == 1) {
    result += "<span class='ui-icon left-align ui-icon-check'/>"
  } else if (claim.resolved == 2) {
    result += "<span class='ui-icon left-align ui-icon-close'/>"
  }
  result += "<a href='" + href + "' class='betdescription' id='displaytitle" + claim.id + "'>";
  result += html_encode(claim.description) + "</a></h2>";
  result += "<a href='" + href + "' class='currentbet'>" + drawBet(claim.currentbet) + "%</a>";
  if (isOpen(claim)) {
    result += "<a class='thick orange right' href='" + href + "' id='displaybutton" + claim.id + "'>Bet on it!</a>";
  } else {
    result += "<a class='thick orange right' href='" + href + "' id='displaybutton" + claim.id + "'>See results</a>";
  }
  result += '<img id="betloader' + claim.id + '" class="loading right" src="ajax-loader.gif"></img>';
  result += "<div class='betdata'>";
  result += "<div class='clear'> Last bet by " + lastBet.user;
  result += " " + drawDate(lastBet.time) + ".</div>";
  if (isOpen(claim)) {
    if (claim.closes) {
      result += "<div class='clear'> Betting closes " + drawDate(claim.closes) + ".</div>";
    }
  } else {
    result += "<div class='clear'> Betting closed " + drawDate(claim.closes) + ".</div>";
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
    result = seconds + (seconds > 1 ? " seconds " : " second ") + description;
  } else if (minutes < 60) {
    result = minutes + (minutes > 1 ? " minutes " : " minute ") + description;
  } else if (hours < 24) {
    result = hours + (hours > 1 ? " hours " : " hour ") + description;
  } else if (days < 1000) {
    result = days + (days > 1 ? " days " : " day ") + description;
  } else {
    result = years + (years > 1 ? " years " : " year ") + description;
  }
  return "<span title='" + d + "'>"+result +"</span>";
}

function prepareLoader(id) {
  return function() {
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
  return !(claim.resolved || (claim.closes && claim.closes < currentTime));
}

function descriptionBox(claim) {
  var tags = claim.tags.concat(claim.groups).map(drawTag).join(', ');
  var result = "<div class='header'><h1>\"" + html_encode(claim.description) + "\"</h1>";
  result += "<div class='row'>Tags: " + tags + "</div></div>";
  return result;
}

function betBox(claim) {
  var result = "<div class='betbox'>";
  result += "<table>";
  result += "<tr><td colspan='2'>Current consensus:</td></tr>";
  result += "<tr><td><div id='oldbet' class='betslider'></div></td>";
  result += "<td><div id='oldbettext'>" + drawBet(claim.currentbet) +  "%</div></td></tr>";
  result += "<tr><td colspan='2'>Your update:</td></tr>"
  result += "<tr><td><div id='left-newbet' class='left-slider-extension'></div>";
  result += "<div id='newbet' class='betslider'></div>";
  result += "<div id='right-newbet' class='right-slider-extension'></div></td>";
  result += "<td><div class='betvalue'> <input type='text' id='betinput'></input>%</div></td></tr>";
  result += "</table>";
  result += '<div class="row">';
  result += '<a id="submitbet" class="thick orange left">Bet on it!</a>';
  if ((user.name == claim.owner || isAdmin()) && !claim.resolved) {
    result += '<a id="resolve" class="thick gray left bet-button">Resolve</a>';
  }
  result += '<img id="betloader" class="loading left spaced" src="ajax-loader.gif"></img></div>';
  result += '<div class="clear error" id="beterror"></div>';
  result += "</div>";
  return result;
}

function closedBetBox(claim) {
  var result = "<div class='betbox'><table>";
  if (claim.resolved) {
    result += "<tr><td colspan='2'>This claim was marked <b>" + (claim.resolved == 1) + "</b>";
    result += " " + drawDate(claim.closes) + ". </td></tr>";
  } else {
    result += "<tr><td colspan='2'>Betting closed on this claim " + drawDate(claim.closes) + ". </td></tr>";
  }
  result += "<tr><td colspan='2'>The market consensus at that time: </td></tr>";
  result += "<tr><td><div id='oldbet' class='betslider'></div></td>";
  result += "<td><div id='oldbettext'>" + drawBet(claim.currentbet) +  "% </div></td></tr>";
  result += "</table>";
  if ((user.name == claim.owner || isAdmin()) && !claim.resolved) {
    result += '<div class="row">';
    result += '<a id="resolve" class="thick gray left bet-button">Resolve</a>';
    result += '</div>';
  }
  result += '<div class="clear error" id="beterror"></div>';
  result += "</div>";
  return result;
}

function stakeBox() {
  var result = "<table id='stakebox' class='center'>";
  result += "<tr><th colspan='3'><h3 class='short'>Outcomes:</h3></th></tr>";
  result += "<tr><td></td>";
  result += "<td><span class='left-align'>If</span>";
  result += "<span class='ui-icon left-align ui-icon-check'/></td>";
  result += "<td><span class='left-align'>If</span>";
  result += "<span class='ui-icon left-align ui-icon-close'/></td>";
  result += "<tr><td>Before this bet</td>";
  result += "<td><span id='oldtruestake' class='payoff'></span></td>";
  result += "<td><span id='oldfalsestake' class='payoff'></span></td></tr>";
  result += "<tr><td>This bet</td>";
  result += "<td><span id='thisbettruestake' class='payoff'></span></td>";
  result += "<td><span id='thisbetfalsestake' class='payoff'></span></td></tr>";
  result += "<tr><td>After this bet</td>";
  result += "<td><span id='curtruestake' class='payoff'></span></td>";
  result += "<td><span id='curfalsestake' class='payoff'></span></td></tr>";
  result += "</table>";
  return result;
}

function redrawStake(stake_id, stake, stake_only) {
  if (stake_only) {
    $('#' + stake_id).html(drawReputation(stake));
  } else {
    $('#' + stake_id).html(drawReputation(user.reputation + stake));
  }
  $('#' + stake_id).removeClass('positive negative');
  if (stake > 0) {
    $('#' + stake_id).addClass('positive');
  } else if (stake < 0) {
    $('#' + stake_id).addClass('negative');
  }
}

function historyBox(claim) {
  var result = "<table id='historybox' class='center" + (claim.resolved ? " resolved" : "") + "'>";
  result += "<tr><th colspan='3'><h3 class='short'>History:</h3></th></tr>";
  result += "<tr class='underline'><th>Estimate</th><th>User</th><th>Time</th></tr>";

  for (var i = claim.history.length - 1; i >= claim.history.length - 10 && i >= 0; i--) {
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
    return "<div class='farleft' id='definitionbox'>" +
        "<h3 class='short'>Precise definition</h3>" + html_encode(claim.definition) + "</div>";
  }
  return "";
}

// TODO: This code could be refactored a bit. Some betslider
// initialization still occurs in setClaimInputHandlers().
function setBetSliderInputHandlers(bounds, defaultBet, claim) {
  $('.betslider').slider({
    step: 0.01,
    value: [defaultBet],
    orientation: "horizontal",
    animate: "fast",
    range: "min"
  });
  $('#newbet').slider({
    min: bounds[0],
    max: bounds[1],
    slide:function(event, ui) {
      setEstimate(claim, ui.value, "slider");
    },
  });
  resizeSlider('newbet', bounds);

  $('#betinput').blur(function() {
    if (isNaN($('#betinput').val())) {
      setEstimate(claim, defaultBet, "");
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

  setEstimate(claim, defaultBet, '');
}

function setClaimInputHandlers(claim) {
  var bounds = [0.01, 0.99];
  if (loggedIn()) {
    bounds = getBetBounds(claim);
  }
  $('#oldbet').slider({
    range: 'min',
    disabled: true,
    min: 0,
    max: 1,
  });
  setBetSliderInputHandlers(bounds, claim.currentbet, claim);

  $('#submitbet').click(function() {
    submitBet(claim, $('#betinput').val()/100);
  });

  $('#resolve').click(function() {
    $('#resolve-dialog').dialog('open');
  });
}

function resizeSlider(slider_id, bounds) {
  var width = $('#' + slider_id).width();
  $('#left-' + slider_id).width(width*bounds[0]);
  $('#' + slider_id).width(width*(bounds[1] - bounds[0]));
  $('#right-' + slider_id).width(width*(1 - bounds[1]));
}

function drawSubmitClaim(claim) {
  $('#mainframe').html(submitClaimBox(claim));
  setSubmitClaimInputHandlers(claim);
}

// When this function is called without a claim, generate a submit claim box.
// When this function is called with a claim, generate an edit claim box.
// (The edit claim box is missing the ability to set some fields, like the multiplier.)
function submitClaimBox(claim) {
  var header = (claim ? 'Edit an existing claim' : 'Submit a new claim');
  var result = '<div class="header"><h1>' + header + '</h1>';
  result += '<div class="row">Starred fields are required.</div></div>';
  result += '<fieldset id="submitclaim-form">';
  result += '<p><label for="description">*Short description: </label>';
  result += '<textarea id="description" maxlength="128"/></p>';
  result += '<p><label for="definition">Precise definition: </label>';
  result += '<textarea id="definition" maxlength="512"/></p>';
  result += '<p><label for="close-date">Market close: </label>';
  result += '<input type="text" id="close-date" maxlength="10"/>';
  result += '<input type="text" id="close-time" maxlength="5"/></p>';
  if (typeof claim == 'undefined') {
    result += '<p><label for="betinput">*Initial estimate: </label>';
    result += '<table id="bettable"><tbody><tr>';
    result += "<td><div id='left-newbet' class='left-slider-extension'></div>";
    result += "<div id='newbet' class='betslider'></div>";
    result += "<div id='right-newbet' class='right-slider-extension'></div></td>";
    result += '<td><input type="text" id="betinput">%<td>';
    result += '</tr></tbody></table></p>';
  }
  result += '<p><label for="tags">*Subject tags: </label>';
  result += "<ul id='tags' data-name='tags'></ul></p>";
  result += '<div id="groups-input"><label for="groups">*Visibility: </label>';
  result += "<ul id='groups' data-name='groups'></ul></div>";
  result += '</fieldset><div id="submitclaim-spacer"/>';
  if (typeof claim == 'undefined') {
    result += "<div class='row'><a class='thick orange' id='submitclaimbutton'>Submit</a></div>";
  } else {
    result += "<div class='row'><a class='thick orange' id='submitclaimbutton'>Edit</a></div>";
  }
  result += '<img id="betloader" class="loading left" src="ajax-loader.gif"></img></div>';
  result += "<div class='error row' id='submitclaimerror'></div>";
  return result;
}

function alignSubmitClaimTextarea(jqtextarea) {
  var offset = jqtextarea.offset();
  offset.left = $('#close-date').offset().left;
  jqtextarea.offset(offset);
  jqtextarea.autosize();
}

// Set input handlers for a submit claim box, or, if 'claim' is defined, for an edit claim box.
function setSubmitClaimInputHandlers(claim) {
  alignSubmitClaimTextarea($('#description'));
  alignSubmitClaimTextarea($('#definition'));

  if (typeof claim == 'undefined') {
    var min_bet = Math.exp(-DEFAULT_MAXSTAKE*(user.reputation - user.committed)/DEFAULT_BOUNTY);
    min_bet = Math.min(Math.ceil(100*min_bet)/100, 0.5);
    var bounds = [min_bet, 1 - min_bet];
    setBetSliderInputHandlers(bounds, 0.5);
    // TODO: Create a div that shows the amount currently staked on this bet.
  } else {
    $('#description').val(claim.description);
    $('#definition').val(claim.definition);
  }

  $('#close-date').datepicker();
  $('#close-time').timepicker();
  if (typeof claim != 'undefined') {
    if (claim.closes) {
      var datetime = jQueryDateTime(claim.closes);
      $('#close-date').val(datetime.date);
      $('#close-time').val(datetime.time);
    }
  }

  var tags = [];
  for (var i = 0; i < cache.alltags.length; i++) {
    tag = cache.alltags[i];
    if (RESTRICTED_TAGS.indexOf(tag) == -1) {
      tags.push(drawTag(tag));
    }
  }
  if (typeof claim != 'undefined') {
    for (var i = 0; i < claim.tags.length; i++) {
      $('#tags').append('<li>' + drawTag(claim.tags[i]) + '</li>');
    }
  }
  $('#tags').tagit({
    allowSpaces: true,
    animate: false,
    autocomplete: {
        delay: 0,
        source: tags,
      },
    removeConfirmation: true,
    sortable: true,
    showAutocompleteOnFocus: true,
  });
  var padding = parseInt($('#tags').css('padding-left'), 10);
  $('#tags').width($('#description').width() - padding - 2);
  $('#tags').find('input').attr('maxlength', 16);

  var groups = ['all'];
  for (var i = 0; i < cache.settings.group_names.length; i++) {
    groups.push(drawTag(cache.settings.group_names[i]));
  }
  if (typeof claim != 'undefined') {
    for (var i = 0; i < claim.groups.length; i++) {
      $('#groups').append('<li>' + drawTag(claim.groups[i]) + '</li>');
    }
  } else {
    $('#groups').append('<li>all</li>');
  }
  $('#groups').tagit({
    allowSpaces: true,
    animate: false,
    autocomplete: {
        delay: 0,
        source: groups,
      },
    removeConfirmation: true,
    sortable: true,
    showAutocompleteOnFocus: true,
  });
  var padding = parseInt($('#groups').css('padding-left'), 10);
  $('#groups').width($('#description').width() - padding - 2);
  $('#groups').find('input').attr('maxlength', 32);

  $('#submitclaimbutton').click(function(){
    submitClaim(claim);
  });
}

function drawSettings(alltags, settings) {
  var mainFrame = "<div class='header'><h1>Manage your groups</h1>";
  if (settings.my_groups.length) {
    mainFrame += '<div class="row">';
    mainFrame += 'Add or remove users from groups you own or ';
    mainFrame += '<a id="create-group-link">create a new group</a>';
    mainFrame += '.</div></div>';
    for (var i = 0; i < settings.my_groups.length; i++) {
      mainFrame += groupBox(settings.my_groups[i]);
    }
  } else {
    mainFrame += '<div class="row">';
    mainFrame += 'You do not own any groups. You can ';
    mainFrame += '<a id="create-group-link">create a new group</a>';
    mainFrame += '.</div></div>';
  }
  if (settings.other_groups.length) {
    mainFrame += "<div class='header'><h1>Manage other groups</h1>";
    mainFrame += ('<div class="row">Choose whether or not to stay in other users\' groups.</div></div>');
    for (var i = 0; i < settings.other_groups.length; i++) {
      mainFrame += groupBox(settings.other_groups[i]);
    }
  }
  $('#mainframe').html(mainFrame);

  $('#create-group-link').click(function() {
    $('#group-help-text').html('');
    $('#group-label, label[for="group-label"]').css('display', '');
    $('#group-label').val('');
    $('#invites').tagit('removeAll');
    clearGroupError();
    $('#group-dialog').dialog('open');
  });
  $('.invite-button').click(function() {
    $('#invites-name').val($(this).attr('data-name'));
    $('#new-invites').tagit('removeAll');
    $('#invites-dialog').dialog('open');
  });
  $('table.members-list tr').click(function() {
    if (window.event.target.type != 'checkbox') {
      var checkbox = $(this).find('input[type="checkbox"]');
      if (checkbox.attr('checked')) {
        checkbox.attr('checked', '');
      } else {
        checkbox.attr('checked', 'checked');
      }
    }
  });
  $('.boot-button').click(function() {
    var emails = [];
    $(this.parentElement).find('input[type="checkbox"]').each(
      function() {
        if ($(this).attr('checked')) {
          var member_elt = $(this.parentElement.parentElement).find('.member-email');
          emails.push(member_elt.text().replace(/\./g, '(dot)'));
        }
      }
    );
    boot_members($(this).attr('data-name'), emails);
  });
  $('.leave-button').click(function() {
    leave_group($(this).attr('data-name'));
  });
}

function groupBox(group, show_invite) {
  var status = getGroupStatus(group);
  var result = '<div class="group-box">';
  result += '<h2 class="group-header">' + html_encode(group.label) + "</h2>";
  if (show_invite) {
    if (status) {
      var button_margin = 8*group.members.length + 11;
      var table_margin = button_margin - 31;
      result += '<a class="long orange right resolve-invite" data-name="' + group.name + '"';
      result += ' data-choice="decline" style="margin-top: ' + button_margin + 'px;">Cancel invite</a>';
    } else {
      var button_margin = 8*group.members.length - 6;
      var table_margin = button_margin - 2;
      result += '<a class="long orange right resolve-invite" data-name="' + group.name + '"';
      result += ' data-choice="accept" style="margin-top: ' + button_margin + 'px;">Accept invite</a>';
      result += '<a class="long gray right resolve-invite" data-name="' + group.name + '"';
      result += ' data-choice="decline">Decline invite</a>';
    }
  } else if (status == 'owner') {
    var button_margin = 8*group.members.length - 6;
    var table_margin = button_margin - 2;
    result += '<a class="long orange right invite-button" data-name="' + group.name + '"';
    result += ' style="margin-top: ' + button_margin + 'px;">Invite members</a>';
    result += '<a class="long gray right boot-button" data-name="' + group.name + '">Boot members</a>';
  } else if (status == 'member') {
    var button_margin = 8*group.members.length + 11;
    var table_margin = button_margin - 31;
    result += '<a class="long gray right leave-button" data-name="' + group.name + '"';
    result += ' style="margin-top: ' + button_margin + 'px;">Leave group</a>';
  }
  result += '<table class="members-list" style="margin-top: -' + table_margin + 'px;">';
  result += '<tr><th></th><th>Member:</th><th>Email:</th></tr>';
  for (i = 0; i < group.members.length; i++) {
    var member = group.members[i];
    var tr = (i % 2 ? '<tr>' : '<tr class="alt">');
    result += tr + '<td class="checkbox-column">';
    if (!show_invite && status == 'owner' && member.email != '(owner)') {
      result += '<input type="checkbox">';
    }
    result += '</td><td>' + member.name + '</td>';
    result += '<td class="member-email">' + member.email + '</td></tr>';
  }
  result += '</table>';
  result += '</div>';
  result += '<hr>';
  return result;
}

// Returns 'owner', 'member' or ''.
function getGroupStatus(group) {
  if (!loggedIn()) {
    return '';
  } else if (group.owner == user.name) {
    return 'owner';
  }
  for (var i = 0; i < group.members.length; i++) {
    if (group.members[i].name == user.name) {
      return 'member';
    }
  }
  return '';
}

function drawInvite(group) {
  if (group.invite_state) {
    var mainFrame = "<div class='header'>";
    if (group.invite_state == user.name) {
      mainFrame += '<h1>You are now a member of "' + html_encode(group.label) + '".</h1>';
    } else {
      mainFrame += '<h1>' + group.invite_state + ' already accepted this invite.</h1>';
    }
    mainFrame += '</div>';
  } else {
    var status = getGroupStatus(group);
    if (status == 'owner') {
      var mainFrame = "<div class='header'><h1>";
      mainFrame += "<h1>Uh oh. It looks like you sent yourself an invite!</h1>";
      mainFrame += '</div>';
    } else if (status == 'member') {
      var mainFrame = "<div class='header'><h1>";
      mainFrame += "<h1>Uh oh. It looks like you got invited to this group again!</h1>";
      mainFrame += '</div>';
    } else {
      var mainFrame = "<div class='header'>";
      mainFrame += '<h1>' + group.owner + ' invited you to join "' + html_encode(group.label) + '".</h1>';
      mainFrame += '</div>';
    }
  }
  mainFrame += groupBox(group, !(group.invite_state));
  mainFrame += '<div class="row"><span class="error" id="resolve-invite-error"/></div>';
  $('#mainframe').html(mainFrame);

  $('.resolve-invite').click(
    function() {
      var choice = $(this).attr('data-choice');
      if (!loggedIn()) {
        setInviteError('You must log in or sign up to ' + choice + ' this invite.');
      } else {
        resolve_invite($(this).attr('data-name'), choice);
      }
    }
  );
  $('.leave-button').click(function() {
    leave_group($(this).attr('data-name'));
  });
}

function drawScores(scores) {
  var mainFrame = "<div class='header'>";
  mainFrame += '<h1>High scores</h1>';
  mainFrame += '<div class="row">Click on a user to see their betting history.</div>';
  mainFrame += '</div>';

  mainFrame += '<table class="scores-list">';
  mainFrame += '<tr class="header-row"><th></th><th>User:</th><th>Reputation:</th></tr>';
  for (i = 0; i < scores.users.length; i++) {
    var username = scores.users[i];
    var reputation = scores.reputations[i];
    mainFrame += (i % 2 ? '<tr' : '<tr class="alt"') + ' data-name="' + username + '">';
    mainFrame += '<td class="rank-column">' + (i + 1) + '</td>';
    mainFrame += '<td class="username-column">' + username + '</td>';
    mainFrame += '<td class="reputation-column">' + drawReputation(reputation) + '</td>'
    mainFrame += '</tr>';
    mainFrame += '<tr><td colspan=3 id="' + username + '-history-row" '
    mainFrame += 'class="hidden history"></td></tr>'
  }
  mainFrame += '</table>';

  $('#mainframe').html(mainFrame);
  $('.scores-list tr').click(function() {
    loadHistoryRow($(this).attr('data-name'));
  });
}

function loadHistoryRow(username) {
  var elt = $('#' + username + '-history-row');
  if (elt.html()) {
    elt.html('');
    elt.addClass('hidden')
  } else {
    elt.html('Loading betting history for ' + username + '...');
    elt.removeClass('hidden')
    $.post('history_query', {
      name: user.name,
      password: user.password,
      other_name: username,
    }, function(username) {
      return function(json) {
        var elt = $('#' + username + '-history-row');
        if (elt.html()) {
          var data = JSON.parse(json);
          if (data.length) {
            var html = '<table class="user-history">';
            for (var i = 0; i < data.length; i++) {
              html += '<tr><td class="' + (data[i].stake < 0 ? 'losing ' : '') + 'user-history-stake">';
              html += drawReputation(data[i].stake) + '</td>';
              if (data[i].uid) {
                html += '<td><a href="#displayclaim+' + data[i].uid;
                html += '">' + html_encode(data[i].description) + '</a></td></tr>';
              } else {
                html += '<td>&lt;private claim&gt;</td>';
              }
            }
            html += '</table>';
            elt.html(html);
          } else {
            elt.html('This user has not yet bet on any claims.');
          }
        }
      };
    } (username));
  }
}

function drawTag(tag) {
  return tag.replace(/_/g, ' ');
}

/* -------------------------------------------------------------------------- *
 * Code for communicating with the server begins here!                        *
 * -------------------------------------------------------------------------- */

function getDisplayData(displayState) {
  var returnCall = function(displayState) {return function() {
    if (isCurrentDisplay(displayState) && displayState.isDirty()) {
      updateDisplay(displayState);
    }
    dirty = newCache();
  };} (displayState);
  displayState.getDisplayData(returnCall);
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

  $.post(queryType, query, function(xml) {
    autoParseXML(xml);
    returnCall(xml);
  }, 'xml');
}

// Take in XML information returned by the server and cache any time,
// reputation, claim, search, or tag information.
function autoParseXML(xml) {
  // TODO: If the return XML contains an error, return the user to the default
  // display and alert him with the error. Check for this condition first; do
  // perform other updates if it occurs.

  // All server return calls should contain a 'currenttime' field.
  currentTime = parseDate($(xml).find('currenttime').text());

  parseUserFromXML(xml);

  // Cache any claims, searches, and lists of tags found in the XML.
  $(xml).find('claim').each(function() {
    cacheClaim(parseClaimFromXML(this));
  });

  $(xml).find('search_result').each(function() {
    var result = [];
    $(this).find('uid').each(function() {
      var id = parseInt($(this).text(), 10);
      if (id in cache.claims) {
        result.push(cache.claims[id]);
      }
    });
    // Only cache the search if all of the relevant claims have been cached.
    if (result.length == $(this).find('uid').length) {
      var query = encodeURIComponent($(this).find('search').text());
      var extra = $(this).find('extra');
      if (extra.length) {
        query += '+' + encodeURIComponent(extra.text());
      }
      cacheSearch(query, result);
    }
  });

  if ($(xml).find('alltags').length > 0) {
    var alltags = [];
    $(xml).find('alltags').find('tag').each(function() {
      alltags.push($(this).text());
    });
    if (!('alltags' in cache) ||
        !(arrayEquals(cache.alltags, alltags))) {
      dirty.alltags = true;
    }
    cache.alltags = alltags;
  }

  if ($(xml).find('settings').length > 0) {
    var settings = {
      tags: [],
      my_groups: [],
      other_groups: [],
      group_names: [],
      groups_version: 0,
    };
    $(xml).find('settings').find('tags').find('tag').each(function() {
      settings.tags.push($(this).text());
    });
    $(xml).find('settings').find('groups').find('group').each(function() {
      var group = parseGroupFromXML(this);
      if (group.owner == user.name) {
        settings.my_groups.push(group);
      } else {
        settings.other_groups.push(group);
      }
      settings.group_names.push(group.name);
      settings.groups_version += group.version;
    });

    if (!('settings' in cache) ||
        !(arrayEquals(cache.settings.tags, settings.tags)) ||
        cache.settings.groups_version != settings.groups_version) {
      dirty.settings = true;
    }
    cache.settings = settings;
  }

  if ($(xml).find('group_query').length > 0) {
    cacheInvite(
      parseGroupFromXML($(xml).find('group_query')),
      $(xml).find('invite_state').text()
    );
  }

  if ($(xml).find('scores').length > 0) {
    var users = [];
    var reputations = [];
    $(xml).find('scores').find('score').each(function() {
      users.push($(this).find('name').text());
      reputations.push(parseFloat($(this).find('reputation').text()));
    });
    if (!('scores' in cache) ||
        !arrayEquals(cache.scores.users, users) ||
        !arrayEquals(cache.scores.reputations, reputations)) {
      cache.scores = {
        users: users,
        reputations: reputations,
      }
      dirty.scores = true;
    }
  }
}

// Tests if two arrays containing simple data types are equal.
function arrayEquals(array1, array2) {
  if (array1.length != array2.length) {
    return false;
  }
  for (var i = 0; i < array1.length; i++) {
    if (array1[i] != array2[i]) {
      return false;
    }
  }
  return true;
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

  result.id = parseInt($(xml).find('uid').text(), 10);
  result.age = parseDate($(xml).find('age').text());
  result.bounty = parseFloat($(xml).find('bounty').text());
  result.closes = parseDate($(xml).find('closes').text());
  result.description = $(xml).find('description').text();
  result.tags = [];
  $(xml).find('tags').find('tag').each(function() {
    result.tags.push($(this).text());
  });
  result.groups = [];
  $(xml).find('groups').find('group').each(function() {
    result.groups.push($(this).text());
  });
  result.maxstake = parseFloat($(xml).find('maxstake').text());
  result.owner = $(xml).find('owner').text();
  result.promoted = ($(xml).find('promoted').text() == '1');
  result.resolved = parseInt($(xml).find('resolved').text(), 10);

  definition = $(xml).find('definition').text();
  result.definition = (definition == '') ? null : definition;

  result.history = []
  $(xml).find('history').find('bet').each(function() {
    better = $(this).find('user').text();
    probability = parseFloat($(this).find('probability').text());
    time = parseDate($(this).find('time').text());
    result.history.push({'user':better, 'probability':probability, 'time':time});
  });
  result.currentbet = result.history[result.history.length - 1].probability;

  result.version = parseInt($(xml).find('version').text(), 10);

  return result;
}

// Returns a group object, with all the relevant fields (listed below) set.
function parseGroupFromXML(xml) {
  var result = {};
  result.name = $(xml).find('group_name').text();
  result.label = $(xml).find('label').text();
  result.owner = $(xml).find('owner').text();
  result.members = [];
  $(xml).find('members').find('member').each(function() {
    var member = {};
    member.name = $(this).find('name').text() || '-';
    member.email = $(this).find('email').text().replace(/\(dot\)/g, '.');
    result.members.push(member);
  });
  result.version = parseInt($(xml).find('version').text(), 10);
  return result;
}

function parseDate(strDate, reorder) {
  if (strDate == '') {
    return null;
  }
  var parts = strDate.split(/[\.\s\/:\-T]/);
  if (reorder) {
    return new Date(Date.UTC(parts[2], parts[0] - 1, parts[1], parts[3], parts[4], parts[5]));
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
}

function cacheClaim(claim) {
  if (!(claim.id in cache.claims) ||
      claim.version != cache.claims[claim.id].version) {
    dirty.claims[claim.id] = true;
  }
  cache.claims[claim.id] = claim;
}

function cacheSearch(query, results) {
  if (!(query in cache.searches) ||
      (results.length != cache.searches[query].length)) {
    dirty.searches[query] = true;
  } else {
    for (var i = 0; i < results.length; i++) {
      if (results[i].id != cache.searches[query][i].id ||
          results[i].version != cache.searches[query][i].version) {
        dirty.searches[query] = true;
      }
    }
  }
  cache.searches[query] = results;
}

function cacheInvite(group, invite_state) {
  group.invite_state = invite_state;
  if (!(group.name in cache.invites) ||
      group.version != cache.invites[group.name].version ||
      group.invite_state != cache.invites[group.name].invite_state) {
    dirty.invites[group.name] = true;
  }
  cache.invites[group.name] = group;
}

/* -------------------------------------------------------------------------- *
 * User commands code begins here!                                            *
 * -------------------------------------------------------------------------- */

function login(name, password){
  queryServer({'login':1, 'name':name, 'password':password},
    function(name, password) {return function(xml) {
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
    };} (name, password)
  );
}

function signup(name, email, password){
  updateServer({'signup':1, 'name':name, 'email':email, 'password':password},
    function(name, password) {return function(xml) {
      var result = $(xml).find('signup').text();
      if (result == 'success') {
        $('#signup-dialog').dialog('close');
        user.name = name;
        user.password = password;
        saveUserState();
        $(window).trigger('hashchange');
      } else if (result == 'usernametaken') {
        setSignupError('That username is taken.');
      } else if (result == 'usernamesize') {
        setSignupError('Enter a username and password above. Your username must be between 4 and 16 characters.');
      } else if (result == 'passwordsize') {
        setSignupError('Your password must be between 4 and 256 characters.');
      } else if (result == 'notalnum') {
        setSignupError('Your username must be lowercase and alphanumeric.');
      } else if (result == 'invalidemail') {
        setSignupError('Your email cannot be recognized.');
      }
    };} (name, password)
  );
}

function logout() {
  user = newUser();
  delete cache.settings;
  saveUserState();
  isForbidden = getDisplayState().isForbidden();
  if (isForbidden) {
    DEFAULT_DISPLAY.setDisplayState();
    setAlert(isForbidden);
  } else {
    $(window).trigger('hashchange');
  }
}

function submitBet(claim, bet) {
  if (!validateBet(claim, bet)) {
    return;
  }

  $('#submitbet').click(function() {});
  $('#betloader').css("visibility", "visible");
  updateServer({'makebet':1, 'id':claim.id, 'bet':bet, 'version':claim.version},
    function(claim) {return function(xml) {
      $('#betloader').css("visibility", "hidden");
      var displayState = new DisplayClaim(claim.id);
      if (isCurrentDisplay(displayState) &&
          cache.claims[claim.id].version != claim.version) {
        updateDisplay(displayState);
      } else {
        $('#submitbet').click(function() {
          submitBet(claim, $('#betinput').val()/100);
        });
      }

      var result = $(xml).find('makebet').text();
      if (result == 'toocommitted') {
        setBetError("You cannot risk that much on one bet.");
      } else if (result == 'samebet') {
        setBetError('You must change the estimate to bet.');
      } else if (result == 'conflict') {
        setBetError('This view is no longer up-to-date. ' +
                    'Someone else bet on this claim while you were on this page. ' +
                    'Refresh to see changes.');
      }
    };} (claim)
  );
}

function resolveClaim(id, outcome) {
  updateServer({'resolveclaim':1, 'id':id, 'outcome':outcome},
    function(id) {return function(xml) {
      var displayState = new DisplayClaim(id);
      if (isCurrentDisplay(displayState)) {
        updateDisplay(displayState);
      }
      if ($(xml).find('resolveclaim').text() == 'conflict') {
        setBetError('Unable to resolve bet.');
      }
    };} (id)
  );
}

function reopenClaim(id) {
  updateServer({'reopenclaim':1, 'id':id},
    function(id) {return function(xml) {
      var displayState = new DisplayClaim(id);
      if (isCurrentDisplay(displayState)) {
        updateDisplay(displayState);
      }
      if ($(xml).find('reopen').text() == 'conflict') {
        setBetError('Unable to reopen bet.');
      }
    };} (id)
  );
}

function promoteClaim(id, outcome) {
  updateServer({'promoteclaim':1, 'id':id, 'outcome':outcome},
    function(id) {return function(xml) {
      var displayState = new DisplayClaim(id);
      if (isCurrentDisplay(displayState)) {
        updateDisplay(displayState);
      }
      if ($(xml).find('resolveclaim').text() == 'conflict') {
        setBetError('Unable to promote bet.');
      }
    };} (id)
  );
}

function deleteClaim(id) {
  updateServer({'deleteclaim':1, 'id':id},
    function(id) {return function(xml) {
      var result = $(xml).find('deleteclaim').text();
      if (result == 'success') {
        DEFAULT_DISPLAY.setDisplayState();
        setAlert('Successfully deleted claim.');
      } else if (result == 'conflict') {
        var displayState = new DisplayClaim(id);
        if (isCurrentDisplay(displayState)) {
          updateDisplay(displayState);
        }
        setBetError('Unable to delete bet.');
      }
    };} (id)
  );
}

// If 'claim' is undefined, submits a new claim. Otherwise, edits 'claim'.
function submitClaim(claim) {
  if (typeof claim == 'undefined' && !loggedIn()) {
    setClaimError("You must log in to submit a claim.");
    return;
  } else if (typeof claim != 'undefined' && !isAdmin()) {
    setClaimError("You must be an admin to edit a claim.");
    return;
  }

  var description = $('#description').val();
  if (description.length < 4) {
    setClaimError("Your claim's description must be longer.");
    return;
  } else if (description.length > 128) {
    setClaimError("Your claim's description must be shorter.");
    return;
  }
  var definition = $('#definition').val();
  if (definition.length > 512) {
    setClaimError("Your claim's definition must be shorter.");
    return;
  }

  if (typeof claim == 'undefined') {
    var bet = $('#betinput').val()/100;
    if (isNaN(bet) || bet <= 0 || bet >= 1) {
      setClaimError('Your initial estimate must be a number between 0 and 1.');
      return;
    }
    var bounty = DEFAULT_BOUNTY;
    var maxstake = DEFAULT_MAXSTAKE;
    if (getBetRisk(bet, bounty) > maxstake * (user.reputation - user.committed)) {
      setClaimError('You are risking too much on this bet. ' +
                    'Decrease your risk by moving your initial estimate closer to 50%.');
      return;
    }
  }

  var closes = null;
  if ($('#close-date').val()) {
    if ($('#close-time').val()) {
      var dateStr = $('#close-date').val() + ' ' + $('#close-time').val() + ':00';
    } else {
      dateStr = $('#close-date').val() + ' 23:59:00';
    }
    closes = parseDate(dateStr, true);
    if (closes == 'Invalid Date') {
      setClaimError('Your entry for market close is malformatted.');
      return;
    } else if (closes < new Date()) {
      setClaimError('Your claim must close at some time in the future.');
      return;
    }
  }

  var tags = $('#tags').tagit('assignedTags');
  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i].replace(/ /g, '_').toLowerCase();
    if (RESTRICTED_TAGS.indexOf(tag) > -1) {
      setClaimError("The tag '" + tag + "' is reserved.");
    } else if (tag.length < 4) {
      setClaimError("The tag '" + tag + "' is too short.");
      return;
    } else if (tag.length > 16) {
      setClaimError("The tag '" + tag + "' is too long.");
      return;
    } else if (tag.match(/^[a-z_]+$/) == null) {
      setClaimError("The tag '" + tag + "' should only contain alphabetic characters or spaces.");
      return;
    } else if (tag[tag.length - 1] == '_') {
      setClaimError("The tag '" + tag + "' has trailing spaces.");
      return;
    }
    tags[i] = tag;
  }
  if (!tags.length) {
    setClaimError('You must enter a tag for this claim.');
    return;
  } else if (tags.length > 16) {
    setClaimError('You cannot assign that many tags to one claim.');
    return;
  }
  tags = JSON.stringify(tags);

  var groups = $('#groups').tagit('assignedTags');
  if (!groups.length) {
    setClaimError('You must make this claim visible to at least one group.');
    return;
  } else if (groups.length > 16) {
    setClaimError('You cannot assign that many groups to one claim.');
    return;
  } else if (groups.indexOf('all') >= 0 && groups.length > 1) {
    setClaimError('If you want to restrict the visibility of this claim, delete the group "all".');
    return;
  }
  var new_groups = [];
  for (var i = 0; i < groups.length; i++) {
    var group = groups[i].replace(/ /g, '_').toLowerCase();
    if (group != 'all' && cache.settings.group_names.indexOf(group) < 0) {
      new_groups.push(groups[i]);
    }
    groups[i] = group;
  }
  if (new_groups.length) {
    show_new_group_dialog(new_groups[0]);
    return;
  }
  groups = JSON.stringify(groups);

  clearClaimError();
  $('#submitclaimbutton').click(function() {});
  if (typeof claim == 'undefined') {
    var update = {'submitclaim':1, 'description':description, 'definition':definition,
        'bet':bet, 'bounty':bounty, 'maxstake':maxstake, 'closes':serverDate(closes),
        'tags':tags, 'groups': groups};
    var updateType = 'submitclaim';
    var newDisplay = DEFAULT_DISPLAY;
  } else {
    var update = {'editclaim':1, 'id':claim.id, 'description':description, 'definition':definition,
        'closes':serverDate(closes), 'tags':tags, 'groups': groups};
    var updateType = 'editclaim';
    var newDisplay = new DisplayClaim(claim.id);
  }
  $('#betloader').css('visibility', 'visible');
  updateServer(update,
    function(claim, updateType, newDisplay) {return function(xml) {
      $('#betloader').css('visibility', 'hidden');
      var result = $(xml).find(updateType).text();
      if (result == 'success') {
        newDisplay.setDisplayState();
        var verb = (typeof claim == 'undefined' ? 'submitted' : 'edited');
        setAlert('Successfully ' + verb + ' claim.');
      } else {
        if (result == 'conflict') {
          setClaimError('Unable to save claim. Another user may have submitted at the same time.');
        } else {
          setClaimError(result);
        }
        $('#submitclaimbutton').click(function() {
          submitClaim(claim);
        });
      }
    };} (claim, updateType, newDisplay)
  );
}

function show_new_group_dialog(new_group) {
  $('#group-help-text').html(
    'You made this claim visible to the group "' +
    html_encode(new_group) +
    '", which does not exit yet. ' +
    'Do you want to create it now?<br><br>'
    );
  $('#group-label, label[for="group-label"]').css('display', 'none');
  $('#group-label').val(new_group);
  $('#invites').tagit('removeAll');
  clearGroupError();
  $('#group-dialog').dialog('open');

  setClaimError(
    'Before submitting this claim you must create the group "' +
    html_encode(new_group) + '".'
    );
}

function create_group(label, invites) {
  var from_submitclaim_page = ($('#group-help-text').html() ? true : false);
  invites = JSON.stringify(invites);
  updateServer({'create_group':1, 'label':label, 'invites':invites},
    function(label, from_submitclaim_page) {
      return function(xml) {
        var result = $(xml).find('create_group').text();
        if (result == 'success') {
          $('#group-dialog').dialog('close');
          if (from_submitclaim_page) {
            // TODO: This hack prevents the page from requesting this group multiple times.
            // We're not computing the exact group name here, but it'll make submitClaim()
            // recognize this group.
            var hacky_group_name = label.replace(/ /g, '_');
            cache.settings.group_names.push(hacky_group_name);
            $('#submitclaimbutton').trigger('click');
          } else {
            $(window).trigger('hashchange');
          }
        } else {
          setGroupError(result);
        }
      };
    } (label, from_submitclaim_page)
  );
}

function send_invites(name, invites) {
  invites = JSON.stringify(invites);
  updateServer({'send_invites':1, 'group_name':name, 'invites':invites},
    function(xml) {
      $('#invites-dialog').dialog('close');
      $(window).trigger('hashchange');
    }
  );
}

function boot_members(name, boots) {
  if (boots.length) {
    boots = JSON.stringify(boots);
    updateServer({'boot_members':boots, 'group_name':name},
      function(xml) {
        var result = $(xml).find('boot_members').text();
        if (result == 'success') {
          $(window).trigger('hashchange');
        } else {
          show_general_dialog('Boot members', result);
        }
      }
    );
  } else {
    show_general_dialog('Boot members', 'Select 1 or more members to boot using the checkboxes.');
  }
}

function leave_group(name) {
  updateServer({'leave_group':1, 'group_name':name},
    function(xml) {
      var result = $(xml).find('leave_group').text();
      if (result == 'success') {
        if (getDisplayState().type == 'invite') {
          DEFAULT_DISPLAY.setDisplayState();
          setAlert('Successfully left group.');
        } else {
          $(window).trigger('hashchange');
        }
      } else {
        show_general_dialog('Leave group', result);
      }
    }
  );
}

function show_general_dialog(title, html) {
  $($('#general-dialog').parent()).find('.ui-dialog-titlebar').html(title);
  $('#general-html').html(html);
  $('#general-dialog').dialog('open');
}

function resolve_invite(name, choice) {
  var displayState = getDisplayState();
  var invite = getDisplayState().invite;
  var hash = getDisplayState().hash;
  updateServer({'resolve_invite':choice, 'group_name':name, 'invite':invite, 'group_hash':hash},
    function(xml) {
      var result = $(xml).find('resolve_invite').text();
      if (result == 'success') {
        if (choice == 'decline') {
          DEFAULT_DISPLAY.setDisplayState();
          setAlert('Canceled invite.');
        } else {
          $(window).trigger('hashchange');
        }
      } else {
        setInviteError(result);
      }
    }
  );
}

function jQueryDateTime(d) {
  return {
    date: "" + padInt(d.getMonth() + 1) + "/" + padInt(d.getDate()) + "/" + d.getFullYear(),
    time: "" + padInt(d.getHours()) + ":" + padInt(d.getMinutes()),
  };
}

function serverDate(d) {
  return (d ? d.toISOString().substr(0, 19) : '');
}

function padInt(x, len){
  if (typeof(len) == 'undefined') len = 2;
  x = "" + x;
  while (x.length < len) x = "0" + x;
  return x;
}

/* -------------------------------------------------------------------------- *
 * Static input handlers for the navbar!                                      *
 * -------------------------------------------------------------------------- */

function setSearchInputHandlers() {
  var onchange = function() {
    var search = $('#search').val();
    var displayState = new ListClaims(search, 'incremental');
    if (!isCurrentDisplay(displayState)) {
      var oldDisplayState = getDisplayState();
      if (oldDisplayState.extra != 'incremental') {
        history.pushState({}, TITLE, '#listclaims+' + displayState.query);
      } else {
        history.replaceState({}, TITLE, '#listclaims+' + displayState.query);
      }
      updateDisplay(displayState);
      getDisplayData(displayState);
    }
  }

  $('#search').keyup(onchange);
  $('#search').blur(onchange);
}

/* -------------------------------------------------------------------------- *
 * Betting logic begins here!                                                 *
 * -------------------------------------------------------------------------- */

function setEstimate(claim, bet, source) {
  if (isNaN(bet)) {
    if (claim != undefined && bet != claim.currentbet) {
      setEstimate(claim, claim.currentbet, source);
    }
    return;
  }
  var bounds = [
      $('#newbet').slider('option', 'min'),
      $('#newbet').slider('option', 'max'),
  ];
  bet = Math.min(Math.max(bet, bounds[0]), bounds[1]);
  if (source != 'slider') {
    $('#newbet').slider({value: [bet]});
  }
  if (source != 'field') {
    $('#betinput').val(drawBet(bet));
  }
  if (claim != undefined && loggedIn()) {
    recalculateView(claim, bet);
  }
}

function recalculateView(claim, bet) {
  // Refresh the old bet slider.
  $('#oldbet').slider({value: [claim.currentbet]});
  $('#oldbettext').html(drawBet(claim.currentbet) + "%");

  // Refresh the stake box.
  var stakes = getStakes(claim, bet);
  redrawStake('oldfalsestake', stakes.old[0]);
  redrawStake('oldtruestake', stakes.old[1]);
  redrawStake('thisbetfalsestake', stakes.cur[0] - stakes.old[0], true);
  redrawStake('thisbettruestake', stakes.cur[1] - stakes.old[1], true);
  redrawStake('curfalsestake', stakes.cur[0]);
  redrawStake('curtruestake', stakes.cur[1]);
}

// TODO: This function can be written to compute max and min directly.
// It's not an issue right now - the loop is not a bottleneck on performance.
function getBetBounds(claim) {
  var oldTrueStake = getStake(claim, claim.history, true);
  var oldFalseStake = getStake(claim, claim.history, false);
  var otherStake = user.committed + Math.min(oldTrueStake, oldFalseStake);

  var newHistory = jQuery.extend([], claim.history);
  newHistory.push({'user':user.name, 'probability':0, 'time':new Date()});
  var min = 1;
  var max = 0;
  for (var i = 1; i < 99; i++) {
    newHistory[newHistory.length - 1].probability = i/100;
    var stake = getStake(claim, newHistory, true);
    if (-stake <= claim.maxstake * (user.reputation - otherStake)) {
      min = i/100;
      break;
    }
  }
  for (var i = 99; i >= 1; i--) {
    newHistory[newHistory.length - 1].probability = i/100;
    var stake = getStake(claim, newHistory, false);
    if (-stake <= claim.maxstake * (user.reputation - otherStake)) {
      max = i/100;
      break;
    }
  }
  min = Math.min(min, claim.currentbet);
  max = Math.max(max, claim.currentbet);
  return [min, max];
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

  for (var i = 0; i < newHistory.length; i++) {
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

function getBetRisk(bet, bounty) {
  return Math.max(-bounty * Math.log(bet), -bounty * Math.log(1 - bet));
}

// Returns true if the user can place this bet, and false otherwise.
function validateBet(claim, bet) {
  if (!loggedIn()) {
    setBetError('You must log in to bet.');
    return false;
  } else if (isNaN(bet) || bet <= 0 || bet >= 1) {
    setBetError('Your new estimate must be a number between 0 and 1.');
    return false;
  } else if (bet == claim.currentbet) {
    setBetError('You must change the estimate to bet.');
    return false;
  }

  var stakes = getStakes(claim, bet);
  var otherStake = user.committed + Math.min(stakes.old[0], stakes.old[1]);
  var curStake = -Math.min(stakes.cur[0], stakes.cur[1]);
  if (isNaN(curStake) ||
      curStake > claim.maxstake * (user.reputation - otherStake)) {
    setBetError('You cannot risk that much on one bet.');
    return false;
  }

  clearBetError();
  return true;
}

/* -------------------------------------------------------------------------- *
 * Called once to initialize the dialogs after the HTML is loaded.            *
 * -------------------------------------------------------------------------- */

function initializeDialogs() {
  $('#signup-dialog').dialog({
    autoOpen: false,
    resizable: false,
    modal: true,
    width: 300,
    buttons: {
      "Submit": function() {
        if ($('#signup-password').val() != $('#retype-password').val()) {
          setSignupError('The passwords you entered do not match.');
        } else {
          signup(
            $('#signup-username').val(),
            $('#signup-email').val(),
            $('#signup-password').val()
          );
        }
      },
      "Cancel": function() {
        $('#signup-dialog').dialog('close');
      },
    },
  });

  $('#resolve-dialog').dialog({
    autoOpen: false,
    resizable: false,
    modal: true,
    height: 108,
    width: 360,
    buttons: [
      {
        html: "<span>Mark true</span><span class='ui-icon right-align ui-icon-check'/>",
        tabIndex: -1,
        click: function() {
          resolveClaim(getDisplayState().id, true);
          $(this).dialog('close');
        },
      },
      {
        html: "<span>Mark false</span><span class='ui-icon right-align ui-icon-close'/>",
        tabIndex: -1,
        click: function() {
          resolveClaim(getDisplayState().id, false);
          $(this).dialog('close');
        },
      },
      {
        text: 'Cancel',
        click: function() {
          $(this).dialog('close');
        },
      },
    ],
  });

  $('#invites').tagit({
    animate: false,
    autocomplete: {
        delay: 0,
        source: [],
      },
    removeConfirmation: true,
    sortable: true,
    showAutocompleteOnFocus: true,
  });
  $('#group-dialog').dialog({
    autoOpen: false,
    resizable: false,
    modal: true,
    width: 300,
    buttons: {
      "Submit": function() {
        if (!$('#group-label').val()) {
          setGroupError('You must enter a group name.');
        } else {
          create_group($('#group-label').val(), $('#invites').tagit('assignedTags'));
        }
      },
      "Cancel": function() {
        $('#group-dialog').dialog('close');
      },
    },
  });

  $('#new-invites').tagit({
    animate: false,
    autocomplete: {
        delay: 0,
        source: [],
      },
    removeConfirmation: true,
    sortable: true,
    showAutocompleteOnFocus: true,
  });
  $('#invites-dialog').dialog({
    autoOpen: false,
    resizable: false,
    modal: true,
    width: 300,
    buttons: {
      "Submit": function() {
        send_invites($('#invites-name').val(), $('#new-invites').tagit('assignedTags'));
      },
      "Cancel": function() {
        $('#invites-dialog').dialog('close');
      },
    },
  });

  $('#general-dialog').dialog({
    autoOpen: false,
    resizable: false,
    modal: true,
    width: 450,
    buttons: {
      "Close": function() {
        $('#general-dialog').dialog('close');
      },
    },
  });
}
