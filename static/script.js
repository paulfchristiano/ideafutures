// A display state is a object mapping 'type' to one of 'listclaims',
// 'displayclaim', 'submitclaim' or 'listtags'.
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
      return 'You must be logged in to see claims you have bet on.';
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
    queryServer({'alltags':1}, returnCall);
  };
  this.isCached = function() {
    return 'alltags' in cache;
  };
  this.isDirty = function() {
    return 'alltags' in dirty;
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
    queryServer({'alltags':1, 'claim':this.id}, returnCall);
  };
  this.isCached = function() {
    return 'alltags' in cache && this.id in cache.claims;
  };
  this.isDirty = function() {
    return 'alltags' in dirty || this.id in cache.claims;
  };
}

function ListTags() {
  this.type = 'listtags';
  this.setDisplayState = function() {
    window.location.hash = this.type;
  };
  this.isForbidden = function() {
    return (!isAdmin() && "You must be logged in to manage tags.");
  };
  this.draw = function() {
    drawTags(cache.alltags, cache.usertags);
  };
  this.updateActiveLink = function() {
    $('#tagsnavlink').addClass('activeLink');
  };
  this.getDisplayData = function(returnCall) {
    queryServer({'alltags':1, 'usertags':1}, returnCall);
  };
  this.isCached = function() {
    return 'alltags' in cache && 'usertags' in cache;
  };
  this.isDirty = function() {
    return 'alltags' in dirty || 'usertags' in dirty;
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
    } else if (params[0] == 'listtags') {
      return new ListTags();
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

  updateActiveLink(displayState);

  $('#sidebar').html(loginSidebarBlock);
  setSidebarInputHandlers(DEFAULT_DISPLAY);

  if (displayState.isCached()) {
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

function clearSignupError(message) {
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

function updateActiveLink(displayState) {
  $('#recentclaimsnavlink').removeClass('activeLink');
  $('#submitclaimnavlink').removeClass('activeLink');
  $('#tagsnavlink').removeClass('activeLink');
  $('#mybetsnavlink').removeClass('activeLink');
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
    result += signupDialog();
  }
  return result + "</div>";
}

function signupDialog() {
  result = '<div id="signup-dialog" title="Sign up"><form><fieldset';
  result += '<label for="signup-username">Username:</label>';
  result += '<input type="text" id="signup-username" class="text-input ui-widget-content ui-corner-all" />'
  result += '<label for="signup-email">Email:</label>';
  result += '<input type="text" id="signup-email" value="" class="text-input ui-widget-content ui-corner-all" />'
  result += '<label for="signup-password">Password:</label>'
  result += '<input type="password" id="signup-password" value="" class="text-input ui-widget-content ui-corner-all" />'
  result += '<label for="retype-password">Retype password:</label>'
  result += '<input type="password" id="retype-password" value="" class="text-input ui-widget-content ui-corner-all" />'
  result += "<br/><div class='row'><span class='error' id='signuperror'></span></div>";
  result += '</fieldset></form></div>';
  return result;
}

function isAdmin() {
  return user.name == 'paulfc' || user.name == 'skishore';
}

function adminSidebarBlock(claim) {
  var result = "<div class='sidebarblock'>";
  if (claim.resolved) {
    result += "<div class='row'><a id='reopen'>Re-open this claim.</a></div>";
    result += "</div><div class='sidebarblock'>";
  }
  result += "<div class='row'><a href='#editclaim+" + encodeURIComponent(claim.id) + "'>";
  if (isOpen(claim)) {
    result += "Edit this claim.</a></div>";
  }
  if (claim.promoted) {
    result += "<div class='row'><a id='unpromote'>Un-promote this claim.</a></div>";
  } else{
    result += "<div class='row'><a id='promote'>Promote this claim.</a></div>";
  }
  result += "<div class='row'><a id='delete'>Delete this claim.</a></div>";
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
    $('#signupbutton').click(function() {
      $('#signup-dialog').find('form').find('input').each(function() {
        $(this).val('');
      });
      clearSignupError('');
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
      mainFrame += " Change your search on the <a href=\"#listtags\">tags</a> page";
      mainFrame += " or <a href=\"#submitclaim\">submit a claim</a>.";
    } else {
      mainFrame += " Log in to change your search on the <a href=\"#listtags\">tags</a> page.";
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
  mainFrame += resolveDialog(claim);
  $('#mainframe').html(mainFrame);
  setClaimInputHandlers(claim);
}

function isOpen(claim) {
  return !(claim.resolved || (claim.closes && claim.closes < currentTime));
}

function descriptionBox(claim) {
  var result = "<div class='header'><h1>\"" + html_encode(claim.description) + "\"</h1>";
  result += "<div class='row'>Tags: " + claim.tags.map(drawTag).join(', ') + "</div></div>";
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
  if ((user.name == claim.owner || isAdmin()) && isOpen(claim)) {
    result += '<a id="resolve" class="thick gray left bet-button">Resolve</a>';
  }
  result += '<img id="betloader" class="loading left" src="ajax-loader.gif"></img></div>';
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
    result += "<tr><td colspan='2'>Betting was closed on this claim " + drawDate(claim.closes) + ". </td></tr>";
  }
  result += "<tr><td colspan='2'>The market consensus at that time: </td></tr>";
  result += "<tr><td><div id='oldbet' class='betslider'></div></td>";
  result += "<td><div id='oldbettext'>" + drawBet(claim.currentbet) +  "% </div></td></tr>";
  result += "</table></div>";
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
  var result = "<table id='historybox' class='center'>";
  result += "<tr><th colspan='3'><h3 class='short'>History</h3></th></tr>";
  result += "<tr class='underline'><td>Estimate</td><td>User</td><td>Time</td></tr>";

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

function resolveDialog(claim) {
  result = '<div id="resolve-dialog" title="Resolve claim">';
  result += '<div id="resolve-spacer"/>';
  result += '<span>Mark this claim true or false when its status is known.</span>';
  result += '</div>';
  return result;
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
          resolveClaim(claim.id, true);
          $(this).dialog('close');
        },
      },
      {
        html: "<span>Mark false</span><span class='ui-icon right-align ui-icon-close'/>",
        tabIndex: -1,
        click: function() {
          resolveClaim(claim.id, false);
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
  var result = '<div class="header"><h1>Submit a new claim</h1>';
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
  result += '</fieldset><div id="submitclaim-spacer"/>';
  if (typeof claim == 'undefined') {
    result += "<div class='row'><a class='thick orange' id='submitclaimbutton'>Submit</a></div>";
  } else {
    result += "<div class='row'><a class='thick orange' id='submitclaimbutton'>Edit</a></div>";
  }
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
  var padding = parseInt($('#tags').css('padding-left'));
  $('#tags').width($('#description').width() - padding - 2);
  $('#tags').find('input').attr('maxlength', 16);

  $('#submitclaimbutton').click(function(){
    submitClaim(claim);
  });
}

function drawTags(alltags, usertags) {
  var mainFrame = "<div class='header'><h1>Manage tags</h1>";
  mainFrame += "<div class='row'>Choose which tags to display by default, ";
  mainFrame += "or view recent claims within a tags.</div></div>";
  mainFrame += "<div>";
  for (var i = 0; i < alltags.length; i++) {
    mainFrame += tagPicker(alltags[i], usertags);
  }
  mainFrame += "</div>";
  $('#mainframe').html(mainFrame);
  for (var i = 0; i < alltags.length; i++) {
    $('#tag' + alltags[i]).click(tagToggler(alltags[i]));
  }
}

function tagPicker(tag, usertags) {
  var type = (usertags.indexOf(tag) > -1) ? "activetag" : 'inactivetag';
  result = "<div class='row'><div class='left tagholder'><a id='tag" + tag + "' class='" + type + "'>";
  var href = '#listclaims+' + encodeURIComponent('tag:"' + drawTag(tag) + '"');
  result += drawTag(tag) + '</a></div><div class="right"> <a href="' + href + '">';
  result += "(view " + drawTag(tag) + ")</a></div> </div>";
  return result;
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

  // Use a GET to do 'query' requests and a POST to do 'update's.
  var request = $.get;
  if (queryType == 'update') {
    request = $.post;
  }

  request(queryType, query, function(xml) {
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
      var id = parseInt($(this).text());
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

  if ($(xml).find('usertags').length > 0) {
    var usertags = [];
    $(xml).find('usertags').find('tag').each(function() {
      usertags.push($(this).text());
    });
    if (!('usertags' in cache) ||
        !(arrayEquals(cache.usertags, usertags))) {
      dirty.usertags = true;
    }
    cache.usertags = usertags;
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

  result.id = parseInt($(xml).find('uid').text());
  result.age = parseDate($(xml).find('age').text());
  result.bounty = parseFloat($(xml).find('bounty').text());
  result.closes = parseDate($(xml).find('closes').text());
  result.description = $(xml).find('description').text();
  result.tags = [];
  $(xml).find('tags').find('tag').each(function() {
    result.tags.push($(this).text());
  });
  result.maxstake = parseFloat($(xml).find('maxstake').text());
  result.owner = $(xml).find('owner').text();
  result.promoted = ($(xml).find('promoted').text() == '1');
  result.resolved = parseInt($(xml).find('resolved').text());

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

  result.version = parseInt($(xml).find('version').text());

  return result;
}

function parseDate(strDate, reorder) {
  if (strDate == '') {
    return null;
  }
  var parts = strDate.split(/[\.\s\/:\-T]/);
  if (reorder) {
    return new Date(parts[2], parts[0] - 1, parts[1], parts[3], parts[4], parts[5]);
  }
  return new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
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
        setSignupError('Your username must be alphanumeric.');
      } else if (result == 'invalidemail') {
        setSignupError('Your email cannot be recognized.');
      }
    };} (name, password)
  );
}

function logout() {
  user = newUser();
  delete cache.usertags;
  saveUserState();
  $(window).trigger('hashchange');
}

function submitBet(claim, bet) {
  if (!validateBet(claim, bet)) {
    return;
  }

  $('#betloader').css("visibility", "visible");
  updateServer({'makebet':1, 'id':claim.id, 'bet':bet, 'version':claim.version},
    function(claim) {return function(xml) {
      $('#betloader').css("visibility", "hidden");
      var displayState = new DisplayClaim(claim.id);
      if (isCurrentDisplay(displayState) &&
          cache.claims[claim.id].version != claim.version) {
        updateDisplay(displayState);
      }

      var result = $(xml).find('makebet').text();
      if (result == 'toocommitted') {
        setBetError("You cannot risk that much on one bet.");
      } else if (result == 'samebet') {
        setBetError('You must change the estimate to bet.');
      } else if (result == 'conflict') {
        setBetError('This view is no longer up-to-date, because someone else bet on this claim.');
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
    setClaimError("You must be logged in to submit a claim.");
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

  clearClaimError();
  $('#submitclaimbutton').click(function() {});
  if (typeof claim == 'undefined') {
    var update = {'submitclaim':1, 'description':description, 'definition':definition,
        'bet':bet, 'bounty':bounty, 'maxstake':maxstake, 'closes':serverDate(closes),
        'tags':tags};
    var updateType = 'submitclaim';
    var newDisplay = DEFAULT_DISPLAY;
  } else {
    var update = {'editclaim':1, 'id':claim.id, 'description':description, 'definition':definition,
        'closes':serverDate(closes), 'tags':tags};
    var updateType = 'editclaim';
    var newDisplay = new DisplayClaim(claim.id);
  }
  updateServer(update,
    function(claim, updateType, newDisplay) {return function(xml) {
      var result = $(xml).find(updateType).text();
      if (result == 'success') {
        newDisplay.setDisplayState();
        var verb = (typeof claim == 'undefined' ? 'submitted' : 'edited');
        setAlert('Successfully ' + verb + ' claim.');
      } else {
        if (result == 'baddata') {
          setClaimError('One or more fields of your claim were incorrectly formatted.');
        } else if (result == 'conflict') {
          setClaimError('Unable to save claim. Another user may have submitted at the same time.');
        }
        $('#submitclaimbutton').click(function() {
          submitClaim(claim);
        });
      }
    };} (claim, updateType, newDisplay)
  );
}

function jQueryDateTime(d) {
  return {
    date: "" + padInt(d.getMonth() + 1) + "/" + padInt(d.getDate()) + "/" + d.getFullYear(),
    time: "" + padInt(d.getHours()) + ":" + padInt(d.getMinutes()),
  };
}

function serverDate(d) {
  if (d == null) {
    return '';
  }
  var month = padInt(d.getMonth() + 1);
  var hour = padInt(d.getHours());
  var minute = padInt(d.getMinutes());
  var second = padInt(d.getSeconds());
  var day = padInt(d.getDate());
  return "" + (d.getFullYear()) + "-" + month + "-" + day +
      " " + hour + ":" + minute + ":" + second;
}

function padInt(x, len){
  if (typeof(len) == 'undefined') len = 2;
  x = "" + x;
  while (x.length < len) x = "0" + x;
  return x;
}

function tagToggler(tag) {
  return function() {
    if (!('alltags' in cache) || !('usertags' in cache) ||
        cache.alltags.indexOf(tag) == -1) {
      return;
    }

    var index = cache.usertags.indexOf(tag);
    if (index > -1) {
      cache.usertags.splice(index, 1);
    } else {
      cache.usertags.push(tag);
    }

    updateServer({'newtags':cache.usertags.join(' ')});
    if (index > -1) {
      $('#tag' + tag).css("color","gray");
      $('#tag' + tag).animate({"font-size":"1.5em",
          "paddingBottom":"0.5em", "paddingTop":"0.5em"}, 200);
    } else {
      $('#tag' + tag).css("color","rgb(235,143,0)");
      $('#tag' + tag).animate({"font-size":"2.5em", "paddingTop":"0em",
          "paddingTop":"0em"} ,200);
    }
  }
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
    setBetError('You must be logged in to bet.');
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
