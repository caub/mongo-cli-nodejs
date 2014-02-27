Mongo-cli
======================

MongoDB from a websocket, with extra features:
 - **Access-rights** on documents
 - **Notifications**

It works by sending `{fn: someFunction, args: someArguments}` following the syntax of  [Mongo's nodejs driver](http://mongodb.github.io/node-mongodb-native/api-generated/collection.html)  
Example in javascript:

    send({fn:'find', args:[{a: 2}]}, function(d){console.log(d)})
    send({fn:'insert', args:[{a:3}]}, function(d){console.log(d)})
    send({fn:'find', args:[{a: {$gt:2}}]}, function(d){console.log(d)})
    send({fn:'findAndModify', args:[{a:3},null,{$set:{a:5,b:12}},{new:true}]}, function(d){console.log(d)})
    send({fn:'findAndModify', args:[{a:6},null,{a:5,b:12},{new:true,upsert:true}]}, function(d){console.log(d)})
    send({fn:'remove', args:[{a: {$exists: true}}]}, function(d){console.log(d)})

    // when you're authentified, access-rights are enabled
    send({fn:'insert', args:[{a:4, _canRemove:['john@gmail.com']}]}, function(d){console.log(d)})
    send({fn:'insert', args:[{a:5,_canRead:['john@gmail.com'],_canUpsert:['john@gmail.com'],_canRemove:['john@gmail.com']}]}, function(d){console.log(d)})


    //notifications:
    //  connected clients receive the update when their rights allow it
    //  note: not all methods will trigger notifications, insert, save, findAndModify, findAndRemove do
    //       update, remove won't since it just return the number of updates, only the sender receives the response.

Demo server:
 - [heroku](http://mongo-cli-nodejs.herokuapp.com/)
 - or from [cloud9](https://c9.io/cytr/mongo-cli-nodejs) (and run the file server.js)

Some demo apps using it:
 - [Chat](http://jsbin.com/facof/latest)
 - [Task list](http://jsbin.com/EduGeZE/latest)
 - [Calendar](http://jsbin.com/UmUbipa/latest)
 - [Collaborative painting](http://jsbin.com/afiMEWa/latest)


![Mongo-cli schema](https://docs.google.com/drawings/d/1YEbvKHo1urJdJAvtwoEUc8vt3bBeEmspr7b_oJtahQU/pub?w=956&h=555 "Mongo-cli schema")