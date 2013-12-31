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

  if (!d._id) { //it's an array of items
    d.forEach(function(c) {wss.broadcast(c, fn, _i, ws);});
  }
  else {
    var reply = JSON.stringify({ fn: fn, msg: d});
    if (d._canRead) {
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
  if (email) {
    conns[email] = ws;
  }

  if (coll) {
    ws.on('message', function(message) {
      console.log('received: %s', message);
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

      if (r.fn in accessControl) {
        accessControl[r.fn](r.args, email);
        if ('_id' in r.args[0])
          r.args[0]._id = new ObjectID(r.args[0]._id);
        r.args.push(function(err, obj) {
          if (r.fn == 'find') { //obj.toArray) { 
            obj.toArray(function(err, data) {
              send({ _i: r._i, msg: data });
            })
          }
          else if (typeof obj == 'object'){ //worth broadcasting
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

console.log('static serve: ', __dirname + '/html');
app.use(express.static(__dirname + '/html'));

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



var accessControl = {
  find: function(args, email) {
    if (email) {
      args[0].$or = (args[0].$or || []).concat([{_canRead: null}, {_canRead: { $in: [email]}}]);
    }
    else {
      args[0]._canRead = null;
    }
  },
  insert: function(args, email) {
    if (!email) {
      if (!args.id) {//surely an array of items
        for (var i = 0; i < args.length; i++)
          removeSpecialFields(args[i]);
      }else {
        removeSpecialFields(args);
      }
    }
  },
  remove: function(args, email) {
    if (email) {
      args[0].$or = (args[0].$or || []).concat([{ _canRemove: null}, {_canRemove: { $in: [email]}}]);
    }
    else {
      args[0]._canRemove = null;
    }
  },
  update: function(args, email) {
    if (email) {
      args[0].$or = (args[0].$or || []).concat([{ _canUpsert: null }, {_canUpsert: {$in: [email]} }]);
    }
    else {
      args[0]._canUpsert = null;
      if (args.length > 1) {
        removeSpecialFields(args[1]);
      }
    }
  }
};
accessControl.findAndModify = accessControl.update;
accessControl.findAndRemove = accessControl.remove;
accessControl.save = accessControl.insert;


function removeSpecialFields(o) {
  if ('$set' in o) {
    delete o.$set._canUpsert;
    delete o.$set._canRemove;
    delete o.$set._canRead;
  }
  if ('$push' in o) {
    delete o.$push._canUpsert;
    delete o.$push._canRemove;
    delete o.$push._canRead;
  }
  delete o._canUpsert;
  delete o._canRemove;
  delete o._canRead;
}
