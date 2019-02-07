// const HTTPS_PORT = 4000; 
// const MAIN_SERVER_ADDR = "http://localhost:3000";
// const STREAM_SERVER_ADDR = "https://localhost:4000";
const HTTPS_PORT = 4040; 
const MAIN_SERVER_ADDR = "http://localhost:8080";
const STREAM_SERVER_ADDR = "https://localhost:4040";
//const HTTPS_PORT = 8443;
//const MAIN_SERVER_ADDR = "http://roomsforhumanity.org:8080";
//const STREAM_SERVER_ADDR = "https://stream.roomsforhumanity.org";
//const DEV_SERVER_ADDR = "http://dev.roomsforhumanity.org:8080";

const express = require('express');
const https = require('https');
const socketIO = require('socket.io');
const fs = require('fs');
const firebase = require('firebase');

/******** OBJECTS ***********/

// Rooms
let streamRooms = {};
let sockets = {};
// retreiveStreamRoomData();

var config = {
    apiKey: "AIzaSyALo9h50KIvWB83v3XiGFC74I-CY9D5DPY",
    authDomain: "rooms-for-humanity.firebaseapp.com",
    databaseURL: "https://rooms-for-humanity.firebaseio.com",
    projectId: "rooms-for-humanity",
    storageBucket: "rooms-for-humanity.appspot.com",
    messagingSenderId: "708739717802"
};
firebase.initializeApp(config);

/************  SERVER SETUP *************/

const certOptions = {
    key: fs.readFileSync('certs/key.pem'),
    cert: fs.readFileSync('certs/cert.pem')
};

let app = express();
let httpsServer = https.Server(certOptions, app);
httpsServer.listen(HTTPS_PORT);
let io = socketIO.listen(httpsServer);
console.log("Connected.");

io.sockets.on('connection', function(socket) {

    console.log("here");

    socket.on('signal', function(message, destUuid, roomName) {
        onSignal(message, destUuid, roomName, socket);
    });

    socket.on('disconnect client', function(userID, roomName) {
        onDisconnect(userID, roomName);
    });

    socket.on('publish', function(userID, roomName, pin) {
        onJoin(userID, socket, roomName, true, pin);
    });

    socket.on('subscribe', function(userID, roomName, pin) {
        onJoin(userID, socket, roomName, false, pin);
    });

    socket.on('create collection', function(name) {
        makeCollection(name);
    });

    socket.on('stats data', function(logs, timeStamp, roomName, userID) {
        uploadStats(logs, timeStamp, roomName, userID);
    });

    socket.on('sender data', function(timeStamp, roomName, userID) {
        requestPeerStats(timeStamp, roomName, userID);
    });

    socket.on('sender stats', function(logs, requesterID, timeStamp, roomName, userID) {
        uploadPeerStats(logs, requesterID, timeStamp, roomName, userID);
    });

    socket.on('quality', function(rating, timeStamp, roomName, userID) {
        uploadQuality(rating, timeStamp, roomName, userID);
    });

    socket.on('publish rooms', function(roomName) {
        onPublish(socket, roomName);
    });

    socket.on('subscribe rooms', function(roomName) {
        onSubscribe(socket, roomName);
    });

    socket.on('query rooms', function(roomName) {
        onQuery(socket, roomName);
    });

    socket.on('set pin', function(pin, roomName) {
        onSetPin(pin, roomName);
    });
    
    fs.readFile("counter.txt", function read(err, data){
	if(err){
	   return console.log(err)
	}	
	var content = data;
	content++;

	fs.writeFile("counter.txt", content, function(err){

	if(err){
	    console.log(err);
	}

	    console.log("New Conversation");
	});

	console.log("Amount of connections: " + content);
    });
});

/******* SETUP MAIN & DEV SERVER CONNECTION *********/

let io_client = require('socket.io-client');
let mySocket = io_client.connect(MAIN_SERVER_ADDR);
mySocket.emit('connect service', STREAM_SERVER_ADDR, "stream");

mySocket.on('sync', function(rcvdUsers, rcvdRooms) {
    users = rcvdUsers;
    rooms = rcvdRooms;
});

mySocket.on('disconnect', function() {
    // console.log("DISCONNECTED");
    // console.log(mySocket.connected);
    var tryToConnect = setInterval(function() {
        if (mySocket.connected) {
            clearInterval(tryToConnect);
            console.log("Connected.");
            mySocket.emit('connect service', STREAM_SERVER_ADDR, "stream");
        }
        console.log("Trying to connect.");
        mySocket = io_client.connect(MAIN_SERVER_ADDR);
    }, 300);
});

/******* FUNCTIONALITY **********/

function onSignal(message, destUserID, roomName, socket) {
    if (streamRooms[roomName].clients[destUserID]) {
        // streamRooms[roomName].clients[destUserID].socket.emit('signal', message);
        sockets[destUserID].emit('signal', message);
    }
}

function onDisconnect(userID, roomName) {
    console.log(userID, "Disconnecting");

    if(streamRooms[roomName]) {
        let clientsInRoom = streamRooms[roomName].clients;
        let numClients = 0;
        for(client in streamRooms[roomName].clients) {
            numClients = numClients + 1;
        }
        console.log(numClients + " clients in the room.");

        // if (clientsInRoom.length === 1 || clientsInRoom.length === undefined) {
        if(numClients === 1) {
            console.log("Attempting to delete the room #1");
            streamRooms[roomName] = null;
            delete streamRooms[roomName];
            return;
        }

        else {
            // Remove Client from room
            console.log("Removing user from room");
            delete streamRooms[roomName].clients[userID];

            // Let everyone know
            for (clientID in clientsInRoom) {
                // clientsInRoom[clientID].socket.emit('disconnect user', userID, roomName);
                sockets[clientID].emit('disconnect user', userID, roomName);
            }

            if(streamRooms[roomName].clients.length === 0) {
                console.log("Attempting to delete the room #2");
                delete streamRooms[roomName];
            }
        }
    }
}

function onJoin(userID, socket, roomName, isPublishing, pin) {
    //console.log("Logging pin");
    //console.log(pin);

    // IF it is a publisher, setup as the broadcaster;
    if (isPublishing === true) {

        // If Room Doesn't Exist
        if (!streamRooms[roomName]) {
            streamRooms[roomName] = {
                clients: {},
                numPublishers: 0,
                pin: pin
            };
        }

        // If the publisher is new
        if (!streamRooms[roomName].clients[userID]) {
            streamRooms[roomName].numPublishers++;

            streamRooms[roomName].clients[userID] = {
                isPublished: true,
                isSubscribed: false,
                // socket: socket,
                userID: userID,
                publisherNumber: streamRooms.numPublishers-1
            };

            sockets[userID] = socket;
        }

        if(!sockets[userID]) {
            sockets[userID] = socket;
        }


        // If publisher already published inform the publisher of all subscribers
        if (streamRooms[roomName].clients[userID].isPublished === true) {
            for (otherClientID in streamRooms[roomName].clients) {
                if (otherClientID !== userID) {
                    socket.emit('subscriber ready', otherClientID, streamRooms[roomName].clients[userID].publisherNumber)
                }
            }
            return;
        }

        // If publisher hasn't published yet
        else if (streamRooms[roomName].clients[userID].isPublished === false) {
            streamRooms[roomName].numPublishers++;

            streamRooms[roomName].clients[userID].isPublished = true;
            streamRooms[roomName].clients[userID].publisherNumber = streamRooms[roomName].numPublishers-1;
        }

        for (otherClientID in streamRooms[roomName].clients) {
            if (otherClientID !== userID && sockets[otherClientID]) {
                sockets[otherClientID].emit('publisher ready', userID, streamRooms[roomName].clients[userID].publisherNumber);
                // streamRooms[roomName].clients[otherClientID].socket.emit('publisher ready', userID, streamRooms[roomName].clients[userID].publisherNumber);
                socket.emit('subscriber ready', otherClientID, streamRooms[roomName].clients[userID].publisherNumber)
            }
        }

        console.log("Streamer joined the session:", roomName);
        return;
    }

    // If Subscribing
    else {

        // if the room doesn't exist, create the room
        if (!streamRooms[roomName]) {
            console.log("Client created room:", roomName);
            streamRooms[roomName] = {
                clients: {},
                numPublishers: 0,
                pin: pin
            };
        }

        // If client is in the room, turn their subscribe on
        // If not add them in and update their socket.
        if (streamRooms[roomName].clients[userID]) {
            streamRooms[roomName].clients[userID].isSubscribed = true;
            // streamRooms[roomName].clients[userID].socket = socket;
        } else {
            streamRooms[roomName].clients[userID] = {
                isPublished: false,
                isSubscribed: true,
                // socket: socket,
                userID: userID,
                publisherNumber: -1
            };

            sockets[userID] = socket;
        }

        // Loop through all publishers and let them know a new;
        // subscriber has joined
        for (clientID in streamRooms[roomName].clients) {
            let client = streamRooms[roomName].clients[clientID];
            if (client.isPublished) {
                sockets[clientID].emit('subscriber ready', userID, client.publisherNumber);
                // client.socket.emit('subscriber ready', userID, client.publisherNumber);
                socket.emit('publisher ready', clientID, client.publisherNumber);
            }
        }
    }
}

// function retreiveStreamRoomData() {
//     console.log("retreiveStreamRoomData");
//     // Queries database for streamRoom
//     var MongoClient = require('mongodb').MongoClient;
//     var url = "mongodb://localhost:27017/";

//     MongoClient.connect(url, function (err, db) {
//         if (err) throw err;
//         var dbo = db.db("mydb");
//         var query = { stream_room: { $exists: true } };
//         // dbo.collection("stream").find(query).toArray()
//         var cursor = dbo.collection("stream").find();
//         cursor.forEach(function(err, item) {
//             if(!err) {
//                 console.log(items);
//             } else {
//                 console.log(err);
//             }
//         });
//         console.log("-------");
//         console.log(cursor);
//         console.log("-------");
//         console.log("Got em");
//     });
// }

// 

function uploadStats(logs, timeStamp, roomName, userID) {
    console.log("uploadStats");
    console.log(roomName + '/' + userID + '/' + timeStamp);
    var ref = firebase.database().ref(roomName + '/' + userID + '/' + timeStamp);
    ref.push ({
        stats: logs
    });
    //let clientsInRoom = streamRooms['#' + roomName].clients;
    //if(clientsInRoom.length > 1) {
    //    for (clientID in clientsInRoom) {
    //        console.log("Client: " + clientID);
    //        if(clientID !== userID) {
    //            sockets[clientID].emit('sender stats');
    //            socket.on('sender data', function(sendLogs) {
    //                var data = 'peerID: ' + userID + ' ' + sendLogs;
    //                ref.push({
    //                    stats: data
    //                });
    //            });
    //        }
    //    }
    //}
    //else {
    //    console.log("One or fewer clients in room");
    //}
}

function requestPeerStats(timeStamp, roomName, userID) {
    var ref = firebase.database().ref(roomName + '/' + userID + '/' + timeStamp);
    for(name in streamRooms) {
        console.log("Room: " + name);
    }
    console.log("Testing room: #" + roomName);
    let clientsInRoom = streamRooms['#' + roomName].clients;
    //if(clientsInRoom.length > 1) {
        for(clientID in clientsInRoom) {
            console.log("Client: " + clientID);
            if(clientID !== userID) {
                console.log("Sending a request for sender stats from client: " + clientID);
                sockets[clientID].emit('sender stats', userID, timeStamp);
                //socket.on('sender data', function(sendLogs) {
                //    var data = 'peerID: ' + userID + ' ' + sendLogs;
                //    ref.push({
                //        stats: data
                //    });
                //});
            }
        }
}

function uploadPeerStats(sendLogs, requesterID, timeStamp, roomName, userID) {
    console.log("Sender stats received, uploading to firebase");
    var ref = firebase.database().ref(roomName + '/' + requesterID + '/' + timeStamp);
    var data = 'peerID: ' + userID + ' ' + sendLogs;
    ref.push({
        stats: data
    });
}

function uploadQuality(rating, timeStamp, roomName, userID) {
    var ref = firebase.database().ref(roomName + '/' + userID + '/' + timeStamp);
    ref.push ({
        quality: rating
    });
    var ref = firebase.database().ref(roomName);
    ref.push ({
        quality: rating,
        timeAtCall: timeStamp,
        user: userID
    });
}

function makeCollection(name) {
    console.log("makeCollection");
    MongoClient.connect('mongodb://admin:enter1234@localhost:27017/roomsStats', function(err, db) {
        if(err) throw err;
        var dbo = db.db("RoomsStats");
        dbo.createCollection(name, function(err, res) {
            if(err) throw err;
            console.log("Collection created");
            db.close();
        });
    });
}

function onPublish(socket, roomName) {
    if(streamRooms[roomName]) {
        socket.emit('publish response', true, streamRooms[roomName].pin);
    }
    else {
        socket.emit('publish response', false, "");
    }
}

function onSubscribe(socket, roomName) {
    if(streamRooms[roomName]) {
        socket.emit('subscribe response', true, streamRooms[roomName].pin);
    }
    else {
        socket.emit('subscribe response', false, "");
    }
}

function onQuery(socket, roomName) {
    console.log(roomName);
    if(streamRooms[roomName] !== undefined) {
        if(streamRooms[roomName].pin === undefined || streamRooms[roomName].pin === "" || streamRooms[roomName].pin === null) {
            socket.emit('query response', true, "");
        }
        else {
            console.log("A room exists with the pin " + streamRooms[roomName].pin);
            socket.emit('query response', true, streamRooms[roomName].pin);
        }
    }
    else {
        console.log("No room with this name exists");
        for(roomName in streamRooms) {
            console.log(roomName);
        }
        socket.emit('query response', false, "");
    }
}

function onSetPin(pin, roomName) {
    if(!streamRooms[roomName])
        console.log('No room with this name exists');
    else {
        streamRooms[roomName].pin = pin;
    }
}
