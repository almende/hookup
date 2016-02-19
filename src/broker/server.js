'use strict';

// commonjs imports
var url = require('url');
var WebSocketServer = require('ws').Server;
var express = require('express');

// es6 imports
import { register, unregister, find } from './register';
import { requestify } from '../shared/requestify';


function createServer (port) {
  port = port || 3000;

  var app = express();
  var server = require('http').createServer();
  var wss = new WebSocketServer({ server: server });
  var debug = require('debug')('hookup:server');
  var debugSocket = require('debug')('hookup:socket');

  wss.on('connection', function connection(socket) {
    var location = url.parse(socket.upgradeReq.url, true);
    // you might use location.query.access_token to authenticate or share sessions
    // or ws.upgradeReq.headers.cookie (see http://stackoverflow.com/a/16395220/151312)

    debugSocket('A peer connected');

    // requestify the WebSocket
    var connection = requestify({
      send: function (message) {
        debugSocket('send message', message);
        socket.send(message)
      }
    });
    socket.on('message', function (message) {
      debugSocket('receive message', message);
      connection.receive(message);
    });

    socket.on('error', function (err) {
      debugSocket('Error', err);
    });

    socket.on('close', function () {
      debugSocket('A peer disconnected');

      unregister(connection);
    });

    // handle incoming requests
    connection.on('request', function (message) {
      var fn = functions[message.type];
      if (!fn) {
        throw new Error(`Unknown message type "${message.type}"`);
      }
      return fn(connection, message);
    });

  });


  var functions = {
    /**
     * Register an id for a peer
     * @param {Object} connection
     * @param {{type: 'register', id: string}} message
     * @return {string} Returns the peers id
     */
    register: function (connection, message) {
      var id = register(connection, message.id);
      connection.hookupId = id;
      return id;
    },

    /**
     * Unregister this peer
     * @param {Object} connection
     * @param {{type: 'register'}} message
     */
    unregister: function (connection, message) {
      unregister(connection);
    },

    /**
     * Forward an offer to connect to a peer, should respond with an answer
     * @param {Object} connection
     * @param {{type: 'connect', from: string, to: string, offer: string}} message
     * @return {Promise.<{answer: string}, Error>}
     */
    connect: function (connection, message) {
      if (message.from !== connection.hookupId) {
        throw new Error(
            `Invalid id. message.from (${JSON.stringify(message.from)}) does not match the id of the the connection (${JSON.stringify(connection.hookupId)})`)
      }

      let to = find(message.to);
      if (!to) {
        throw new Error(`Peer not found (message.to: ${message.to}})`);
      }
      return to.request(message);
    }
  };


  server.on('request', app);
  server.listen(port, function() {
    console.info(`Listening on port ${port}`);
  });

  return app;
}

var PORT = 3000;
createServer(PORT);