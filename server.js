// Создание глобальных параметров и запуск прослушивания порта 3000, создаем express серве и связываем с socket.io

var express = require('express'),
	application	= express(),
    server = require('http').createServer(application),
    io = require('socket.io').listen(server),
    port = 3000, 

  //хэш для хранения клиентских данных 
  // { socketid: { clientid, nickname }, socketid: { ... } }
  chatClients = new Object();

  // прослушка порта
  server.listen(port);

// конфигурирование экспресса, т.к. этот сервер является 
//  web севрером, необходимо объявить
// пути к статическим файлам
application.use("/styles", express.static(__dirname + '/public/styles'));
application.use("/scripts", express.static(__dirname + '/public/scripts'));
application.use("/images", express.static(__dirname + '/public/images'));

// предоставление файла (index.html)
// когда клиент посылает запрос к корню приложения
// (http://localhost:8080/)
application.get('/', function (req, res) {
	//
	res.sendfile(__dirname + '/public/index.html');
});

// устанавливаем уровень лога socket.io 2, отображение подключениий и дисконнектов
io.set('log level', 2);

// предоставление транспортировки для запросов,если клиент
// не поддерживает 'websockets' тогда сервер будет
// возврашен 'xhr-polling' https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
io.set('transports', [ 'websocket', 'xhr-polling' ]);

// socket.io ивенты, каждое соединение будет проходить через них
// и каждый ивент будет генерироваться у клиента.
// handle function для каждого ивента
io.sockets.on('connection', function(socket){
	// после подключения, клиент посылает нам инфо 
	// nick через ивент коннекта
	socket.on('connect', function(data){
		connect(socket, data);
	});
	// когда клиент посылает сообщение, он выдает 
	// этот ивент, затем сервер передает
	// сообщение для других  
	socket.on('chatmessage', function(data){
		chatmessage(socket, data);
	});	
	// подписка клиента в разделе чата
	socket.on('subscribe', function(data){
		subscribe(socket, data);
	});
	// клиент отписывается от комнаты
	socket.on('unsubscribe', function(data){
		unsubscribe(socket, data);
	});	
	// когда клиент вызывает функцию 'socket.close()'
	// или закрывает браузер, это событие построено в 
	// socket.io, таким образом мы не должны
	// удалять его вручную
	socket.on('disconnect', function(){
		disconnect(socket);
	});
});

// создание клиента для socket
function connect(socket, data){
	//созадние ID
	data.clientId = generateId();

	// сохранение хэша клиента для быстрого доступа
	// сохраняем эти данные 
	// для сокета с 'socket.set(key, value)'
	// но единственный способ вернуть его обратно
	// async
	chatClients[socket.id] = data;

	// апдейт клиента
	socket.emit('ready', { clientId: data.clientId });
	
	// авто подключение клиента к разделу  'Room1'
	subscribe(socket, { room: 'Room1' });

	// доступные разделы  
	socket.emit('roomslist', { rooms: getRooms() });
}

// когда клиент уходит, отписываем его от разделов
function disconnect(socket){
	// получить разделы клиента
	var rooms = io.sockets.manager.roomClients[socket.id];	
	for(var room in rooms){
		if(room && rooms[room]){
			unsubscribe(socket, { room: room.replace('/','') });
		}
	}
	// удаление клиента
	delete chatClients[socket.id];
}

// получение сообщения от клиента и пересылка в релевантный раздел
function chatmessage(socket, data){
	// без клиента 
	socket.broadcast.to(data.room).emit('chatmessage', { client: chatClients[socket.id], message: data.message, room: data.room });
}

// подписка клиента к разделу
function subscribe(socket, data){
	// получение списка всех активных разделов
	var rooms = getRooms();
	// проверить, существует ли такой раздел, если нет, оповестить всех 
	if(rooms.indexOf('/' + data.room) < 0){
		socket.broadcast.emit('addroom', { room: data.room });
	}
	// подписка клиента к разделу
	socket.join(data.room);
	// оповестить всех клиентов
	updatePresence(data.room, socket, 'online');
	// послать клиенту обо всех активных клиентах в разделе
	socket.emit('roomclients', { room: data.room, clients: getClientsInRoom(socket.id, data.room) });
}

// отписать клиента от раздела, когда клиент дисконектится или переходит в другой раздел
function unsubscribe(socket, data){
	// оповестить всех об офлайне клиента
	updatePresence(data.room, socket, 'offline');
	// удалить клиента из socket.io раздела
	socket.leave(data.room);
	// если клиент был один разделе
	// оповестить о закрытии раздела всех
	if(!countClientsInRoom(data.room)){
		// с 'io.sockets'  можем подключиться ко всем клиентам
		io.sockets.emit('removeroom', { room: data.room });
	}
}

// 'io.sockets.manager.rooms' объект для хранения
// активных разделов, возвращающий имена
function getRooms(){
	//
	return Object.keys(io.sockets.manager.rooms);
}

// получить массив клиентов в разделе
function getClientsInRoom(socketId, room){
	// получить массив ID сокетов в разделе
	var socketIds = io.sockets.manager.rooms['/' + room];
	var clients = [];	
	if(socketIds && socketIds.length > 0){
		socketsCount = socketIds.lenght;
		// поместить каждого клиента в результрующий массив
		for(var i = 0, len = socketIds.length; i < len; i++){		
			//проверить, если сокет не тот, который требуется
			if(socketIds[i] != socketId){
				clients.push(chatClients[socketIds[i]]);
			}
		}
	}	
	return clients;
}

// получить количество клиентов в разделе 
function countClientsInRoom(room){
	// 'io.sockets.manager.rooms' объект, который содержит в себе
	// массив названий активных разделов и массив
    // и  ID подписанных клиентов
	if(io.sockets.manager.rooms['/' + room]){
		return io.sockets.manager.rooms['/' + room].length;
	}
	return 0;
}

// опопвестить об онлайне офлайне клиента
function updatePresence(room, socket, state){
	//
	room = room.replace('/','');
	// используя 'socket.broadcast' мы можем послать событие/сообщение
	// всем, за исключением самого клиента
	socket.broadcast.to(room).emit('presence', { client: chatClients[socket.id], state: state, room: room });
}

// генератор ID
function generateId(){
	var S4 = function () {
		return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
	};
	return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

console.log('Chat server is running and listening to port %d...', port);