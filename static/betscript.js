            var currentLocation;

        //  Variables describing current user
            var user;
            var reputation;

        //  Variables controlling logic/display for betting
            var topicDescription;
            var topic;
            var oldProbability = 0;
            var newProbability = 0;
            var currentAwards[2];
            var owner;
            var initialProbability;
            var locked;
            var maxstake;
            var bounty;


            function display(x){
                return (x).toFixed(2);
            }

            function loadTopicOverview(newTopic){
                topic = newTopic;
                currentLocation = "topicOverview";
            }

            function setOld(p){
                oldProbability = p;
                $('#oldbetslider').slider({
                    value: [p * 100]
                });
                $('#oldbettext').html((p*1).toFixed(2));
                updateWinnings();
            }
            function getCommitments(){
                $.post('totalcommitment.php', {user : username, topic : topic, outcome:0 })
                .success(function(data){
                    failsAward = parseFloat(data);
                    $('#occurscommitmentdisplay').html((failsAward).toFixed(2));
                    updateWinnings();
                })
                $.post('totalcommitment.php', {user : username, topic : topic, outcome:1})
                .success(function(data){
                    occursAward = parseFloat(data);
                    $('#failscommitmentdisplay').html((occursAward).toFixed(2));
                    updateWinnings();
                })
            }
            function logIn(action){
                username = $('#usernameinput').val();
                password = $('#passwordinput').val();
                $('#userbox').load("userbox.php", {username:username,
                    password:password, action:action});
                $('#infobox').load("infobox.php",{topic:topic}, refreshValues);
                return false;
            }
            function refreshValues(){
                topic = $('#topic').val();
                reputation = parseFloat($('#reputation').val());
                username = $('#username').val();
                oldbetvalue = parseFloat($('#oldbetvalue').val());
                bounty = parseFloat($('#bounty').val());
                maxstake = parseFloat($('#maxstake').val());
                $('#bountydisplay').html((bounty).toFixed(2));
                $('#maxbetdisplay').html((reputation * maxstake).toFixed(2));
                getCommitments();
            }
            function setNew(p, moveSlider){
                if (isNaN(p)) return;
                newProbability = p;
                if (moveSlider){
                    $('#newbetslider').slider({
                        value: [p *100]
                    });
                }
                if (!locked) $('#occurbet').val((p*1).toFixed(2));
                updateWinnings();
            }
            function payoff(outcome){
                if (outcome)
                    return bounty * (Math.log(newProbability) - Math.log(oldProbability));
                else
                    return bounty * (Math.log(1 - newProbability) - Math.log(1 - oldProbability));
            }
            function payoffString(outcome){
                v = payoff(outcome);
                if (v >= 0) return "+" + (v*1).toFixed(2);
                else return (v*1).toFixed(2);
            }
            function updateWinnings(){
                $('#occur').html(payoffString(true));
                $('#occurtotal').html((payoff(true) + occursAward).toFixed(2));
                $('#notoccur').html(payoffString(false));
                $('#notoccurtotal').html((payoff(false) + failsAward).toFixed(2));
            }
            function test(){
                alert('!!!');
            }
            function loadTopic(newtopic){
                $('#topic').val(newtopic);
                $('#mainframe').load('topic.php', {topic:newtopic, username: username}, function (){ initializeTopic();} );
            }
            function initializeTopic(){
                refreshValues();
                updateWinnings();
				$('.betslider').slider({
                    min: 0,
                    max: 100,
                    slide: function(event, ui) {
                        setNew(ui.value / 100, false);
                    },
                    range:"min",
                    animate:"normal",
                    orientation: "horizontal",
                    value: [100*oldbetvalue]
                });
                $('#oldbetslider').slider({
                    disabled: true
                });
                setOld(oldbetvalue);
                setNew(oldbetvalue, false);
                $('.probability').click(function(){ this.select(); });
                $('#occurbet').focus(function(){ locked = true;  });
                $('#occurbet').blur(function(){ 
                    locked = false;
                    setNew($('#occurbet').val(), true);
                });
                $('#occurbet').keyup(function(){
                    setNew($('#occurbet').val(), true);
                }); 
                $('#submitbet').click(function(){
                    potentialOccursAward = payoff(true) + occursAward;
                    potentialFailsAward = payoff(false) + failsAward;
                    if (!(username.length > 0)){
                        $('#beterror').html("You must be signed in to bet.");
                    } else if (potentialOccursAward < -1 * reputation * maxstake){
                        $('#beterror').html("If you make this bet and the assertion is true, you will lose " 
                            + (-1*potentialOccursAward).toFixed(2) +". <br/> You cannot risk more than " 
                            + (reputation * maxstake).toFixed(2) + ".");
                    } else if (potentialFailsAward < -1 * reputation * maxstake){
                        $('#beterror').html("If you make this bet and the assertion is false, you would lose " 
                            + (-1*potentialFailsAward).toFixed(2) +". <br/> You cannot risk more than " 
                            + (reputation * maxstake).toFixed(2) + ".");
                    } else {
                        $.post("processbet.php", { bet : newProbability, user: username, topic : topic }, function(){
                            $('#history').load("history.php", {'topic': topic});
                        });
                        setOld(newProbability);
                        refreshValues();
                        updateWinnings();
                        $('#beterror').html("");
                    }
                });
                $('#falsifyclaim').click(function(){
                    $.post("clearbet.php", 
                        { outcome: 0, topic : topic,
                          bounty: bounty})
                    .success(function(data){
                        $('#mainframe').load("notopic.php");
                    });
                });
                $('#verifyclaim').click(function(){
                    $.post("clearbet.php", 
                        { outcome: 1, topic : topic })
                    .success(function(data){
                        $('#mainframe').load("notopic.php");
                    });
                });
                if (username.length > 0){
                    $('#infobox').load("infobox.php",{topic:topic}, refreshValues);
                }
            }
            function loadNoTopic(){
                $('#mainframe').load('notopic.php');
            }
            $(document).ready(function(){
               refreshValues();
               if (topic > 0 && topic != "none"){
                initializeTopic();
               }
            });
