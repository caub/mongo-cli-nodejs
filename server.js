// reference the http module so we can create a webserver
// Note: when spawning a server on Cloud9 IDE, 
// listen on the process.env.PORT and process.env.IP environment variables

// Click the 'Run' button at the top to start your server,
// then click the URL that is emitted to the Output tab of the console


var mongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var http = require('http');
var express = require('express');
var app = express();
var WebSocketServer = require('ws').Server;

var openid = require('openid');
var url = require('url');
var querystring = require('querystring');


var server = http.createServer(app);
server.listen(process.env.PORT, process.env.IP);

var extensions = [new openid.UserInterface(), 
                  new openid.SimpleRegistration(
                      {
                        "email" : true
                      }),
                  new openid.AttributeExchange(
                      {
                        "http://axschema.org/contact/email": "required",
                        "http://axschema.org/namePerson/friendly": "required",
                        "http://axschema.org/namePerson": "required"
                      }),
                  new openid.PAPE(
                      {
                        "max_auth_age": 24 * 60 * 60, // one day
                        "preferred_auth_policies" : "none" //no auth method preferred.
                      })];
                      
var relyingParty = new openid.RelyingParty('http://mongo-cli.herokuapp.com/verify', // Verification URL (yours)
  null, // Realm (optional, specifies realm for OpenID authentication)
  false, // Use stateless verification
  false, // Strict mode
  extensions); // List of extensions to enable and include


var prefix = "tests.";
var tokens = {}; //token : email
var emails = {}; //email : token

var db = null;

mongoClient.connect('mongodb://cyril:cccc1111@ds053978.mongolab.com:53978/jfx', function(err, _db) {
  if (err) throw err;
  console.log("Connected to Database");
  db = _db;
});

var conns = { _: [] };

var wss = new WebSocketServer({
  server: server,
  path: '/api'
});
wss.broadcast = function(d, fn, _i, ws) {

  if (Array.isArray(d)) {
    d.forEach(function(c) {wss.broadcast(c, fn, _i, ws);});
  }
  else {
    var reply = JSON.stringify({ fn: fn, msg: d});
    if (d._canRead) {
       if (d._canRead.length===0)
          ws.send(JSON.stringify({ _i: _i,fn: fn, msg: d}));
       else
          d._canRead.forEach(function(i) {
            var wsi = conns[i];
            if (wsi) {
              if (wsi === ws) wsi.send(JSON.stringify({ _i: _i,fn: fn, msg: d}));
              else wsi.send(reply);
            }
          });
    }
    else {
      for (var i in this.clients) {
        if (ws === this.clients[i]) this.clients[i].send(JSON.stringify({ _i: _i,fn: fn, msg: d}));
        else this.clients[i].send(reply);
      }
    }
  }
};


wss.on('connection', function(ws) {

  console.log(ws.upgradeReq.url);
  var query = querystring.parse(url.parse(ws.upgradeReq.url).query);
  conns._.push(ws);
  console.log(query.token, query.coll);
  var token = query.token;
  var email = tokens[token];
  var coll = query.coll ? db.collection(prefix + query.coll) : null;
  var accessControl = accessControlAnonymous;
  if (email) {
    conns[email] = ws;
    accessControl = accessControlAuthenticated;
  }

  if (coll) {
    ws.on('message', function(message) {

      var r = JSON.parse(message);
      /*if(r.token){
         token = r.token;
        email = tokens[token];
        if (email ){
          conns[email] = ws;
        }
       }
       if (r.coll){
         coll = db.collection(prefix+r.coll);
       }*/

      if (accessControl.hasOwnProperty(r.fn)) {
        try{
           accessControl[r.fn](r.args, email);
        } catch(e){
          console.log(e);
          send({ _i: r._i, msg: {error: e} });
        }

        console.log('r ', JSON.stringify(r.args));
        r.args.push(function(err, obj) {
          if (r.fn == 'find') { //obj.toArray) { 
            obj.toArray(function(err, data) {
              send({ _i: r._i, msg: data });
            })
          }
          else if (typeof obj == 'object' && obj!==null){ //worth broadcasting
            //send({_i:r._i, msg: obj});
            wss.broadcast(obj, r.fn, r._i, ws);
          }else{
            send({ _i: r._i, msg: obj });
          }
        })
        coll[r.fn].apply(coll, r.args);
      }
      else if (r.fn=='auth'){
        send({ _i: r._i, msg: email });
        
      }else{//echo
        send(r);
      }

    });
  }
  else {
    ws.on('message', function(message) {
      ws.send(JSON.stringify({error: 'put token and coll in the url querystring' }));
    });
  }

  function send(o) {
    ws.send(JSON.stringify(o));
  }


  ws.on('close', function() {
    //.log('b4 ', conns._.length);
    conns._.splice(conns._.indexOf(ws), 1);
    //  console.log('a4 ', conns._.length);
    if (email) delete conns.email;
  });
});

app.get('/authenticate', function(request, response) {
    var identifier = request.query.openid_identifier;

    // Resolve identifier, associate, and build authentication URL
    relyingParty.authenticate(identifier, false, function(error, authUrl)         {
            if (error) {
                    response.writeHead(200);
                    response.end('Authentication failed: ' + error.message);
            }
            else if (!authUrl) {
                    response.writeHead(200);
                    response.end('Authentication failed');
            }
            else {
                    response.writeHead(302, { Location: authUrl });
                    response.end();
            }
    });
});

app.get('/verify', function(request, res) {
    // Verify identity assertion
    // NOTE: Passing just the URL is also possible
    relyingParty.verifyAssertion(request, function(error, result) {
            res.writeHead(200);
            if (!error && result.authenticated){
              var token = Math.ceil(1e16*Math.random()).toString(16);
              emails[result.email] = token;
              tokens[token] = result.email;
              result.token = token;
              console.log(result);
                  res.end( 
                  '<script>var r = '+JSON.stringify(result)+';function receiveMessage(event){'+
                      'event.source.postMessage(JSON.stringify(r), event.origin);window.close();}'+
                    'window.addEventListener("message", receiveMessage, false);</script>' );
            }else
              res.end('Failure :('); // TODO: show some error message!
    });
});

console.log('static serve: ', __dirname + '/app');
app.use('/', express.static('app' ));
//app.use(express.static(__dirname + '/app'));


var buildAccessAnonymous = {
    read: function(email){  return [{_canRead:null},{_canRead:{$size:0}}] },
    upsert: function(email){ return  [{_canUpsert:null},{_canUpsert:{$size:0}}] },
    remove: function(email){ return [{_canRemove:null},{_canRemove:{$size:0}}] }
};
var buildAccessAuthenticated = {
    read: function(email){return [{_canRead:null},{_canRead:{$size:0}},{_canRead: { $in: [email]}}]},
    upsert: function(email){ return [{_canUpsert:null},{_canUpsert:{$size:0}},{_canUpsert: { $in: [email]}}]},
    remove: function(email){ return [{_canRemove:null},{_canRemove:{$size:0}},{_canRemove: { $in: [email]}}] }
};

var accessControlAnonymous = new AccessControl(buildAccessAnonymous);
var accessControlAuthenticated = new AccessControl(buildAccessAuthenticated);

function AccessControl(buildAccess) {

  this.find= function(args, email) {
    if (args[0].hasOwnProperty('$query')) {
       if (args[0].$query.$or){
         args[0].$query = {$and: [args[0].$query, {$or: buildAccess.read(email) } ]};
       }else{
         args[0].$query.$or = buildAccess.read(email);
       }
    }else{
      if (args[0].$or){
        args[0] = {$and: [args[0], {$or: buildAccess.read(email) } ]};
      }else{
        args[0].$or = buildAccess.read(email);
      }
    }
  };
  this.insert= function(args, email) {
    if (!email) {
      if (Array.isArray(args)) {
        for (var i = 0; i < args.length; i++)
          removeSpecialFields(args[i]);
      }else {
        removeSpecialFields(args);
      }
    }
  };
  this.remove= function(args, email) {
    if (args[0].$or){
      args[0] = {$and: [args[0], {$or: buildAccess.remove(email) } ]};
    }else{
      args[0].$or = buildAccess.remove(email);
    }
  };
  this.update= function(args, email) {
    if (args[0].$or){
      args[0] = {$and: [args[0], {$or: buildAccess.upsert(email) } ]};
    }else{
      args[0].$or = buildAccess.upsert(email);
    }

    if (!email){
      //update object is either the last or before last if options are given// (broken with findAndModify(q,sort,doc) .. todo
      if (args.length ==2) {
        removeSpecialFields(args[1]);
      }else if (args.length > 2) {
        removeSpecialFields(args[args.length-2]);
      }
    }
    /*if (args[0]._id)
        args[0]._id = new ObjectID(args[0]._id);*/
  };

  this.findAndModify= this.update;
  this.findAndRemove= this.remove;
  this.save = this.insert;
};


function removeSpecialFields(o) {
  if ( o.hasOwnProperty('$set')) {
    delete o.$set._canUpsert;
    delete o.$set._canRemove;
    delete o.$set._canRead;
  }
  if ( o.hasOwnProperty('$push')) {
    delete o.$push._canUpsert;
    delete o.$push._canRemove;
    delete o.$push._canRead;
  }
  delete o._canUpsert;
  delete o._canRemove;
  delete o._canRead;
}
