// Connects to socket.io server
var socket;
var roomName = window.location.hash;
var STREAM_SERVER_NAME = "https://stream.roomsforhumanity.org";

var isIE = /*@cc_on!@*/false || !!document.documentMode;
var isSafari = /constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || (typeof safari !== 'undefined' && safari.pushNotification));
var isEdge = !isIE && !!window.StyleMedia;
if (isIE || isSafari || isEdge) {
    alert("For best experience, please switch to a supported web browser. Supported browsers include Google Chrome, Mozilla Firefox, and Opera")
}

var masterUser = undefined; // used from pulling user from cache
var user = {}; // used to identify user in signaling
var services = { // we only have a stream server, you can basically ignore this 
  "stream": streamEng
};


// The following propreties are used for laying out the videos
// and updating their views 
var isPublished = false; // has the user published their stream?
var videoIndices = []; // array of the index of all videos available
var activeVideos = []; // array of the indices of all videos visible on screen
var hiddenVideos = []; // array of the indices of all videos hidden from view

$(document).ready(function() {
    socket = io.connect(); // connect to the main server
	//console.log(randomWords(5));
    // Check if a user has been created, if so make sure to disconnect them
    // from the system first so there are not any errors when we recconect them in a bit
    loadUserFromCache(function() {
      if (user !== undefined) {
        //   socket.emit('disconnect client', user.userID, user.roomName);
        //  streamEng.socket.emit('disconnect client', user.userID, user.roomName);  
      }

      user = {};
      user.name = 'user'; // just a demo of setting user info
        
      setupSocket(); // setup the signalling servers 
      streamEng.publish();
      
      // Screenshare button is currently hidden
      $('#screenshareButton').click(function() {
          streamEng.shouldScreenshare = true;
          $('#screenshareButton').attr("disabled", "true");
          $('#publishButton').attr("disabled", "true");
          $('#screenshareButton').css('opacity', '0.25');
          $('#publishButton').css('opacity', '0.25');

          $('#infoText').attr('hidden', 'true');
          streamEng.publish();
          $('#publishButton').css('opacity', '0.25');
      });

      // Send message button
      $('#message-button').click(sendMessage);

      // When the user is typing, on keyup check to see if they've pressed enter
      // send message if user pressed enter
      $('#message-input').keyup(function(event) {
          if (event.keyCode === 13) {
              sendMessage();
          }
      });

      // Button used to display chat box on left
      $('#open-chat-button').click(function() {
          chatBox = $('#chat-box');
          if (chatBox.hasClass('showBox')) {
              $('#chat-box').removeClass("showBox");
              $('#remote-video-div').removeClass("video-on-chat-open");
          } else {
              $('#chat-box').addClass("showBox");
              $('#remote-video-div').addClass("video-on-chat-open");
          }
      });

      // Start listening to new messages from firebase
      listenForNewMessages();
    });
    var roomNameString = window.location.href.split('#');
	$('#roomNameID').text(roomNameString[1]);

	$('#infoBox').on('click', function(){
		$('#infoContainer').toggle();
	});
    $('#roomModal').modal('show');
});



/******* SOCKET ********/

function setupSocket() {

//   IGNORE THIS - IT IS OLD CODE BUT DON'T WANT TO DELETE IT YET
//   socket.on('created user', function(userID) {
//     user.userID = userID;
//     saveUsersToCache(user);
//     // Send join stream system Message
//     socket.emit('join service', user.userID, 'stream', roomName);
//   });
//   socket.on('joined service', function(userID, serviceType, serviceAddress) {
//     var engine = services[serviceType];
//     engine.serviceAddress = serviceAddress;
//     engine.setupService();
//   });

  user.userID = uuid(); // create new userId for client;
  saveUsersToCache(user); // save user so we can load them later
  streamEng.serviceAddress = STREAM_SERVER_NAME;
  streamEng.setupService();

  // When a user's video has been published, show their video to them
  streamEng.onPublish = function(stream) {
      console.log("On Publish called");

      if (!isPublished) {
          activeVideos.push('#local-video');
      }

      isPublished = true;

      $('#local-video-div').html(function() {
           return "<video muted id=\"local-video\" class=\'"
                 + (streamEng.shouldScreenshare ? "screenshare" : "")
                 + "\' autoplay></video>";
       });

      document.getElementById('local-video').srcObject = stream;
      applyColumnClassesToVideo();
  }

  // When we receive a stream from another user, show that user's video
  streamEng.onAddNewPublisher = function(videoIndex) {
    if (!videoIndices.includes(videoIndex)) {
        // Add video to videoIndices list (master list) and active video list
        var videoId = "#remoteVideo"+videoIndex.toString();
        videoIndices.push(videoIndex);
        activeVideos.push(videoId);

	console.log(activeVideos.length);
        // Add video to HTML
        var newVideoLayer = "<div class=\"videoStream\"><video id=\"remoteVideo" + videoIndex + "\" autoplay></video>";
        if(activeVideos.length % 3 == 1){
		$('.row').css('height', '50%');
		$('.row').after('<div class="row" style="height: 50%"></div>')
	}
	$('.row').last().append(newVideoLayer);
	//$('#remote-video-div').append(newVideoLayer);
    }

    applyColumnClassesToVideo();
  };

  // When a user leaves the room, remove their video 
  streamEng.onDeletePublisher = function(videoIndex) {
    removeVideo(videoIndex);
  }
}

/***** VIDEO LAYOUT FUNCTION ****/

//Fullscreens the video with a given index  
function fullscreenVideo(videoId) {
    var actives = activeVideos.slice();
    for (id in actives) {
        if (actives[id] !== videoId) {
            $(actives[id]).parent().hide();
            hiddenVideos.push(actives[id]);
            removeItemFromArray(activeVideos, actives[id]);
        }
    }

    // setTimeout(applyColumnClassesToVideo, 200);
    applyColumnClassesToVideo();
}

// Undoes the actions of the fullscreenVideo function
function unFullscreenVideo() {

    for (id in hiddenVideos) {
        activeVideos.push(hiddenVideos[id]);
    }
    hiddenVideos = [];

    $('video').parent().show();
    // setTimeout(applyColumnClassesToVideo, 200);
    applyColumnClassesToVideo();
}

// Removes a video from sight completely
function removeVideo(videoIndex) {
    if(activeVideos.length % 3 == 1){
        $('.row').last().remove();
	$('.row').css('height','100%');
    }
    else{
        $('#remoteVideo'+ videoIndex.toString()).parent().closest('div').remove();
    }
    removeItemFromArray(videoIndices, videoIndex);
    removeItemFromArray(activeVideos, "#remoteVideo"+videoIndex.toString());
    applyColumnClassesToVideo();
}

// Lays out the videos in their proper grid
function applyColumnClassesToVideo() {
    var videos = document.querySelectorAll('video');
    for (i in videos) {
        videos[i].onclick = function(event) {
            if (activeVideos.length === 1) {
                unFullscreenVideo();
            } else {
                fullscreenVideo("#" + event.target.id);
            }
        };
    };

    var columnSize;
    var smallColumnSize;
    if (activeVideos.length === 1) {
        columnSize = 12;
        smallColumnSize = 12;
    } else if (activeVideos.length === 2) {
        columnSize = 6;
        smallColumnSize=12;
    } else if (activeVideos.length >= 3) {
        columnSize = 4;
        smallColumnSize = 6;
    }

    if (isPublished) {
        $('#local-video-div').attr('class',"");
        $('#local-video-div').addClass("col col-lg-" + columnSize.toString() + " col-md-" + columnSize.toString() + " col-sm-" + smallColumnSize.toString() + " col-" + smallColumnSize.toString());
        //$('body').attr('class', 'bg-dark');
    }

    for (var i = 0; i < videoIndices.length; i++) {
    $('.videoStream').attr('class',"videoStream");
    $('.videoStream').addClass("col col-lg-" + columnSize.toString() + " col-md-" + columnSize.toString() + " col-sm-" + smallColumnSize.toString() + " col-" + smallColumnSize.toString());
    $('.videoStream').addClass('centering');
  }

    /*if (activeVideos.length === 0) {
        $('body').attr('class', 'bg-light');
        $('#infoText').attr('hidden', 'false');
        $('.navbar-brand').css('color', 'black');
    } else {
        $('#infoText').attr('hidden', 'true');
        $('body').attr('class', '');
        $('body').css('background-color', 'black');
        $('.navbar-brand').css('color', 'whitesmoke');
    }*/
}

/***** USER FUNCTIONS ****/

// Saves the global user object to the browser's cache
function saveUsersToCache(user) {
    user.roomName = roomName;
    localStorage['blink-chat-user-info'] = JSON.stringify(user);
}

// Loads a user saved in cache into the global user object
function loadUserFromCache(callback) {
    var user_string = localStorage['blink-chat-user-info'];
    if (user_string !== undefined) {
        user = JSON.parse(user_string);
    } else {
        user = undefined;
    }

    if (localStorage['blink-user-info'] !== undefined) {
      masterUser = JSON.parse(localStorage['blink-user-info']);
      user.name = masterUser.displayName;
      user.userID = masterUser.uid;
    }

    callback();
}

/****** MESSAGES **********/

// Send chat message via firebase
function sendMessage() {
    var message = $('#message-input').val();
    $('#message-input').val("");

    var msg = {
        fromUser: user,
        message: message
    };

    updateMessagesToFirebase(msg);
}

// Displays a message in the chatbox
function addMessageToChatBox(message) {
    var darker = "";
    if (message.fromUser.userID === user.userID) {
        darker = "darker";
    }

    var html = "<div class=\"message-item " + darker + "\">" +
        "<img class=\"message-img\" src=\"img/blink.png\"/>" +
        "<p class=\"message-text\">" + message.message + "</p> </div>";

    $("#messages").append(html);
    $('#messages').scrollTop($('#messages').prop("scrollHeight"));
}

/***** FIREBASE *******/

function updateMessagesToFirebase(message) {
    var roomName_name = "rooms/" + roomName.substring(1);

    var newMessageKey = database.ref().child(roomName_name).push().key;
    var updates = {};
    updates[roomName_name + '/messages/' + newMessageKey] = message;
    database.ref().update(updates);
}

function listenForNewMessages() {
    var roomName_name = "rooms/" + roomName.substring(1);
    var messageRef = database.ref(roomName_name + '/messages');
    messageRef.on('child_added', function(snapshot) {
        addMessageToChatBox(snapshot.val());
    });
}

/***** HELPER FUNCTIONS ****/

function removeItemFromArray(array, item) {
    var index = array.indexOf(item);
    if (index > -1) {
      array.splice(index, 1);
    }
}
  
// Generates a random 16-character string used for userID
function uuid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}
