function goToChat(roomname) {
  window.location.href = "https://" + window.location.hostname + "/chat.html#" + roomname;
}

$(document).ready(function() {
    $('#createButton').on('click',function(){
    var Room = words({min: 2, max: 3, maxLength: 4, formatter: (word) => word.slice(0,1).toUpperCase().concat(word.slice(1))});
    
    goToChat(Room.join(''));
    });

    $('#joinRoomButton').on('click', function(){
        goToChat($('#roomNameInput').val());
    })
})
