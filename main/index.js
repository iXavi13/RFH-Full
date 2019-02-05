const HTTPS_PORT = 8443;
const HTTP_PORT = 8080;
const COLLECTION = "blink-main-rooms";
//const HTTPS_PORT = 4000;
//const HTTP_PORT = 80;

const nodeStatic = require('node-static');
const https = require('https');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const express = require('express');
//const randomWords = require('random-words');

//console.log(randomWords(5));
// Data Structures
let users = {
    // uuid: {}
};

let sockets = {};
let services = {
    stream: {
        address: null,
        socket: null
    }
};

let rooms = {
    // roomName: {
    //   name: "name", // Identifier of the room
    //   services: [], // Array of allowed services
    //   users: {} // Dictionary of members allowed (for easy pulling)
    // },
};


/************ SERVER SETUP *************/

const certOptions = {
    key: fs.readFileSync('public/certs/key.pem'),
    cert: fs.readFileSync('public/certs/cert.pem')
};

let app = express();
let httpsServer = https.Server(certOptions, app);
httpsServer.listen(HTTPS_PORT);

app.use(express.static('public'));
let io = socketIO.listen(httpsServer);


io.sockets.on('connection', function(socket) {

    socket.on('create user', function(user, roomName) {
        createUser(user, roomName, socket);
    });

    socket.on('join service', function(userID, serviceType, roomName, user) {
        setupService(userID, serviceType, roomName, user, socket);
        console.log("Joined System.", roomName);
    });

    socket.on('disconnect client', function(userID, roomName) {
        sendDisconnecToServices(userID, roomName);
    });

    socket.on('master_log', function(event) {
      masterLog(event);
    })
});

function sendDisconnecToServices(userID, roomName) {
    serviceIo.sockets.emit('disconnect client', userID, roomName);
}

/************ SERVICES SERVER SETUP *************/

let httpServer = http.Server(app);
httpServer.listen(HTTP_PORT);
let serviceIo = socketIO.listen(httpServer);


serviceIo.sockets.on('connection', function(socket) {

    socket.on('connect service', function(serviceAddress, serviceType) {
        services[serviceType].address = serviceAddress;
        services[serviceType].socket = socket;
        console.log("Connected Service:", serviceType, serviceAddress);
        syncUpdateService(serviceType);
    });

    socket.on('sync user request', function() {
        socket.emit('sync', users, rooms);
    });

    socket.on('sync', function(rcvdUsers, rcvdRooms) {
        users = rcvdUsers;
        rooms = rcvdRooms;
        updateAllServices();
    });

    socket.on('master_log', function(event) {
      masterLog(event);
    });
});

console.log("Connected.");

/*********** Google Firebase ************/

//var admin = require("firebase-admin");
//var serviceAccount = require("./files/blink-chat-3d18ca48caf7.json");
//admin.initializeApp({
//    credential: admin.credential.cert(serviceAccount),
//    databaseURL: "https://blink-chat-6f619.firebaseio.com/"
//});
//var db = admin.database();

/*function masterLog(event) {
  event.datetime = getCurrentDateTime();

  var ref = db.ref("master_log/");
  var newLogKey = ref.child("pods").push().key;

  db.ref('master_log/' + newLogKey).set(event);
}
*/
/******** FUNCTIONS *********/

function createUser(user, roomName, socket) {
    let newUser = {
        // userID: uuid(),
        name: user.name,
        userImg: user.userImg
    };

    if (user.userID === undefined) {
      newUser.userID = uuid();
      masterLog({
        type: "created user",
        userID: newUser.userID,

      })
    } else {
      newUser.userID = user.userID;
    }

    // Add user to the array of users
    sockets[newUser.userID] = socket;
    users[newUser.userID] = newUser;

    // Add user to room
    if(!rooms[roomName]) {
        rooms[roomName] = {
            users: {}
        };

        rooms[roomName].roomName = roomName;
        rooms[roomName].users[newUser.userID] = newUser
    } else {
        rooms[roomName].users[newUser.userID] = newUser;
    }

    socket.emit('created user', newUser.userID, newUser.name);
}

// Create user for system
function setupService(userID, serviceType, roomName, user, socket) {

    // Set the proper server address
    let serviceAddress;

    // If room doesn't exist
    if (!rooms[roomName]) {
        let newUser = user;

        // Add user to the array of users
        sockets[newUser.userID] = socket;
        users[newUser.userID] = newUser;

        // Add user to room
        if(!rooms[roomName]) {
            rooms[roomName] = {
                users: {}
            };

            rooms[roomName].roomName = roomName;
            rooms[roomName].users[newUser.userID] = newUser
        } else {
            rooms[roomName].users[newUser.userID] = newUser;
        }
    }

    // Add service structure
    if (!rooms[roomName].hasOwnProperty('services')) {
        rooms[roomName].services = {};
    }

    if (!rooms[roomName].services.hasOwnProperty(serviceType)) {
        rooms[roomName].services[serviceType] = createService(serviceType);
    }

    if (services[serviceType]) {
        serviceAddress = services[serviceType].address;
        socket.emit('joined service', userID, serviceType, serviceAddress);
        console.log("Joined service:", userID, serviceType, serviceAddress);
    } else {
        console.log("Service to setup not found.");
    }

    syncUpdateService(serviceType);
}
function syncUpdateService(serviceType) {
    updateDatabse();

    if(services[serviceType].socket) {
        services[serviceType].socket.emit('sync', users, rooms);
    } else {
        console.log("Failed to update service. Please check service type:", serviceType);
    }
}
function updateAllServices() {
    for (service in services) {
        syncUpdateService(service);
    }

    updateDatabse();
}
function updateDatabse() {
    // mongodb.collection(COLLECTION).insertOne({"room": {}}).then(function() {
    //     mongodb.collection("blink-main-rooms").find({room: {}}).sort({_id: -1}).toArray(function(err, results) {
    //         console.log(results[0]);
    //     });
    // });
}


/****** HELPER FUNCTIONS ******/

function createService(serviceType) {

    if (serviceType == "bid") {
        return {
            lots: [{
                itemName: "Mona Lisa",
                description: "Does it need a description?",
                itemImg: "items/monalisa.jpg"
            },
                {
                    itemName: "Rolex Daytona 116500",
                    description: "High end fancy watch.",
                    itemImg: "items/rolex.jpg"
                },
                {
                    itemName: "The Raj Pink",
                    description: "The World's Largest known Fancy Intense Pink Diamond",
                    itemImg: "items/pinkDiamond.png"
                },
                {
                    itemName: "Moussaieff Blue Diamond Ring",
                    description: "Superb and exceptional fancy vivid blue diamond ring",
                    itemImg: "items/blueDiamond.png"
                },
                {
                    itemName: "Audemars Piguet",
                    description: "A LIMITED EDITION SKELETONIZED PLATINUM AUTOMATIC WRISTWATCH WITH DATE REF 15203PT.OO.1240PT.01 MVT 822702 CASE H59883 NO 25/40 ROYAL OAK 40TH ANNIVERSARY CIRCA 2012",
                    itemImg: "items/ap.png"
                },
                {
                    itemName: "Jaeger-LeCoultre",
                    description: "A LIMITED EDITION PLATINUM RECTANGULAR REVERSIBLE SKELETONIZED WRISTWATCH REF 270.6.49 NO 51/500 REVERSO PLATINUM NUMBER ONE CIRCA 2001",
                    itemImg: "items/jWatch.png"
                },
                {
                    itemName: "CESARE TACCHI | Come è liscia la tua pelle",
                    description: "Signed, titled and dated 1965 on the reverse, ink on padded fabric nails on board",
                    itemImg: "items/paint1.jpg"
                },
                {
                    itemName: "ANDY WARHOL | Onion Soup from Campbell's Soup",
                    description: "Signed and numbered 165/250 on the reverse, silkscreen on paper, executed in 1969",
                    itemImg: "items/paint2.jpg"
                },
                {
                    itemName: "ROBERTO CRIPPA | Insetto",
                    description: "Iron, executed in the Fifites",
                    itemImg: "items/sculpt1.jpg"
                },
                {
                    itemName: "MARIO SCHIFANO | Gigli d'acqua per terra",
                    description: "Handmade senneh knots wool carpe realized by Bosmann manifacture, executed in 1984",
                    itemImg: "items/carpet1.jpg"
                },
            ],
            currentLotNumber: 0,
            highestBid: 0,
            bidCount: 0,
            bids: [],
            hasStartedBid: false,
        }
    }
}

function uuid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function getCurrentDateTime() {
  var today = new Date();
  return today.toGMTString();
}
