MongoWebConsole-nodejs
======================

MongoDB from a websocket, with extra features: documents access-rights, and notifications

The syntax is following nodejs-mongodb driver API: http://mongodb.github.io/node-mongodb-native/api-generated/collection.html

example in javascript: `send({fn:'find', args:[{name: 'cyril'}]}, function(d){console.log(d)})`

demo: http://mongo-cli.herokuapp.com/
