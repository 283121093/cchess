#!/usr/bin/env node

(
function main()
{
    console.log("Nodeweb starting...");
    // Import modules
    var cb = require("./callback")
    //var mime = require("./mime")
    var config = require("./config")
    var StringDecoder = require('string_decoder').StringDecoder;
    var decoder = new StringDecoder('utf8');
    var http = require('http')
    var url = require('url')
    var util = require('util')
    var path = require('path')
    var fs = require('fs')
    var chat = require('./chat.js');
    var fh = require('./filehandler')
    var user = require('./user');
    var store = {};
    // require('./util');

    // For nodeweb path dispatch
    // var rootroute = ['pub', 'cchess', 'qr', 'chat', ]

    // Function object to store HTTP response headers.
    function webres()
    {
        this['Content-Type'] = 'text/plain; charset=utf-8';
    }

    // Function object Nodeweb. 
    function NodeWeb()
    {
        this.server = http.createServer(this.callback('dispatch'))
        
        this.webroot = path.resolve(process.argv[1], '../../web');
        
        console.log("Webroot is " + this.webroot);
        this.props = readProps();
        this.logpath = !!this.props.sdcard ? this.props.sdcard : (this.webroot + config.chatlog);
        if (!!this.props.port)
        {
            this.port = Number(this.props.port);
        }
        else
        {
            this.port = 8000;
        }
        console.log("port = " + this.port);

        this.address = config.address
        this.sessions = []
    }

    function readProps()
    {
        var pf = path.resolve(process.argv[1], '../../config.props');
        var p = fs.readFileSync(pf);
        var t = decoder.write(p);
        var sa = t.split(/[\r\n]+/);
        var c = {};
        var st = /^([^=]+)=(.*)$/;
        for (var l in sa)
        {
            var m = sa[l].match(st);
            if (m != null)
            {
                c[m[1]]=m[2];
            }
        }
        return c;
    }

    // Treat the path of this script as root to store scripts
    function scriptPath()
    {
        var re = /\.js/
        for (var p in process.argv)
        {
            var d = process.argv[p]
            r = re.exec(d)
            if (r != null)
            {
                var dirname = path.dirname(process.argv[p])
                if (dirname == '.')
                {
                    break;
                }
                return dirname;
            }
        }

        return path.resolve('.')
    }

    // Function object represent one http interaction (request and reply) 
    function NodeSession(req, res)
    {
        cb.initStateMachine(this)        
        this.req = req
        this.res = res
        this.webroot = web.webroot
        this.path = '/'
        this.logpath = web.logpath;
        
//        console.log(this.req.url);

        // State Machine 
        this.set({
            "states" : config.states        })

        // Collect post data
        this.collectData = function(data)
        {
            console.log('data event received ' + data);
            this.req.data += data;
        }

        this.exit = function()
        {
            console.log('process is going to terminate');
            
            this.res.writeHead(200);
            this.res.end();
            this.result(1);
            this.go();
            setTimeout(process.exit, 200);
        }

        // For a post request, try to collect post data
        // It would finally transfer to "urlparse"
        this.prepare = function()
        {
            this.req.data = '';
            console.log('NodeSession prepare : req url = '+ req.url)

            if (this.req.method == 'POST' && req.readable)
            {
                req.setEncoding('utf8');
                req.on('data', this.callback('collectData'));
                req.once('end', this.result(1));
                console.log('prepare branch 1');
            }
            else
            {
                this.result(1);
                this.go();
                console.log('prepare branch 2');
            }
        }

        this.filedone = function()
        {
            var wr = new webres()
            wr['Content-Type'] = this.filereq.mime
            if (this.filereq.ext == "apk")
            {
            	wr['Content-Disposition'] = "attachment; filename=\""  
                    + this.filereq.name + "\"";
            }
            this.res.writeHead(200, wr)
            this.res.end(this.filereq.data)
            this.result(1)
            this.go()
        }

        this.notfound = function()
        {
            console.log("For " + this.req.url + ", found nothing")
            this.res.writeHead(404)
            this.res.end();
            this.result(1)
            this.go()
        }

        this.fileerr = function()
        {
            console.log("For " + this.req.url + ", unknown request");
            this.res.writeHead(404);
            this.res.end();
            this.result(1);
            this.go();
        }

        this.restreq = function()
        {
            this.res.writeHead(200,new webres());
            this.res.end("Wait for rest plugin to be implemented ...");
            this.result(1);
            this.go();
        }

        this.redirect = function()
        {
            var url = this.req.url;
            if (url.charAt(url.length -1) != '/')
            {
                url += '/'
            }
            url += config.indexfile;
            this.res.writeHead(301, 
                    {'Location':url});
            this.res.end();
            this.result(1);
            this.go();
        }

        this.done = function()
        {
            console.log("Access " + this.req.url + " done");
        }
        
        this.apk = function()
        {
        	this.filepath = web.props.apk;
        	this.result(1);
        	this.go();
        }
        
        this.pathparse = function(route)
        {
            var p = this.reqobj.rest
            while (p.length > 0 && p[0] == '') p.shift();
            
            var it = p.shift()
            var r = route.indexOf(it);
            // r = -1 stands for not found, redirect to 1
            // r >= 0 stands for match a route.
            if (r >= 0) this.path = path.join(this.path, it)
            r += 2

            return r;
//            this.result(r);
        }

        this.urlparse = function()
        {
            req.removeAllListeners(); 
            this.reqobj = url.parse(this.req.url, true)
            /* BUG : next statement would cause sig 11, due to the string is too long*/
//            console.log("Reqobj = " + JSON.stringify(this.reqobj));
//            console.log("Accsse " + this.req.url);

//            if (this.reqobj.pathname == 'favicon.ico')
//            {
//                this.reqobj.path = '/pub/favicon.ico'
//            }

            var p = this.reqobj.pathname.split('/');
            if (p.indexOf('..') >=0)
            {
                this.result(1);
                this.go();
                return;
            }
            this.reqobj.rest = p;
            req.rest = p;
            var r = this.pathparse(config.rootroute);
            this.result(r+1);
            this.filepath = this.webroot + this.reqobj.pathname
            this.go();

        }

        this.fileaccess = function()
        {
//            if (this.filepath.charAt(this.filepath.length - 1) === '/')
//            {
//                this.filepath += config.indexfile
//                console.log("Append indexfile");
//            }
//            console.log("Access file : " + this.filepath)
            this.filereq = new fh.FileHandler(this.filepath);

            this.filereq.set({
                states: [
                    ["filter", 1, -2],
                    ["check", 2],
                    ["stat", 3, -3],
                    ["read", 4],
                    ["readed", -1, -4]
                ]
//            this.filereq.set({
//                states: [
//                    ["filter", 1, -2],
//                    ["statSync", 2, -3],
//                    ["readSync", -1, -4]
//                ]
            })


            this.result(1);
            this.go();
        }

        this.listlog = function()
        {
            var files = fs.readdirSync(this.logpath);
            var ret = {}
            for (var f in files)
            {
                ret[files[f]] = fs.statSync(this.logpath + '/' + files[f]);    
            }

            var wr = new webres()
            wr['Content-Type'] = 'application/json';

            this.res.writeHead(200, wr);
            this.res.end(JSON.stringify(ret));
            this.result(1)
            this.go()
        }
        
        this.loadlog = function()
        {
        	var plog = this.reqobj.rest.shift(); 
        	var fn = this.logpath + '/' + plog;
        	var data = '[]';
        	if (fs.existsSync(fn))
        	{
        	    data = '[' + fs.readFileSync(fn, 'utf8') + ']';
                    console.log("loadlog : " + data);
        	}
                else
                {
                    console.log(fn + " is not exists");
                }
        	var wr = new webres()
        	wr['Content-Type'] = 'application/json';
        	
        	this.res.writeHead(200, wr);
        	this.res.end(data);
        	this.result(1);
        	this.go();
        }

        this.qr = function()
        {
            str = path.join.apply(null,this.reqobj.rest)
            str = decodeURIComponent(str);
            console.log("QR : " + str);
            wr = new webres();
            wr["Content-Type"] = 'image/png';
            buf = process.str2qr(str);
            this.res.writeHead(200, wr)
            this.res.end(buf);
            this.result(1);
            this.go();
            return;
        }

        this.chat = function()
        {
            console.log('enter chat');
            var sid = this.reqobj.query.sid;
            console.log("sid = " + sid);
            this.chatObj = new chat.Chat(req, res, this.logpath, sid);
        }
        
        this.save = function()
        {
        	var item = this.reqobj.rest.shift();
        	store[item] = JSON.parse(this.req.data);
        	this.res.writeHead(200);
        	this.res.end();
        	this.result(1);
        	this.go();
        }
        
        this.load = function()
        {
        	var item = this.reqobj.rest.shift();
        	var data = JSON.stringify(store[item]);
        	var wr = new webres()
        	wr['Content-Type'] = 'application/json';
        	
        	this.res.writeHead(200, wr);
        	this.res.end(data);
        	this.result(1);
        	this.go();
        }
        
        this.remove = function()
        {
        	var item = this.reqobj.rest.shift();
        	delete store[item];
        	
        	console.log('item ' + item + ' removed');
        	this.res.writeHead(200);
        	this.res.end();
        	this.result(1);
        	this.go();
        }
        
        /*
        this.reg = function()
        {
            this.user = new user.User(id, req, res);
            this.user.set( 
            {
                "states" :[ 
                    ['reg', 1, 6],          // 0
                    ['buffer', 2],          // 1
                    ['deliver', 3],         // 2
                    ['regdone', 4],         // 3
                    ['send', 5],            // 4
                    ['commit', 4],          // 5
                    ['regged', -1]          // 6
                ]
            });
            wr = new webres();
            wr['Content-Type'] = 'text/plain';
            res.writeHead(200, wr);

            this.result(1);
            this.go();
            return;
        }
        
        this.say = function()
        {
            var message = this.reqobj.rest.shift();
            message = unescape(message);
            u = user.getUser(req);
            
            if (u)
            {
                u = new user.User(u.id, req, res);
                wr = new webres();
                wr['Content-Type'] = 'text/plain';
                this.res.writeHead(200,wr)
                u.message = u.id + ':' + message;
                u.set({'states': [
                        ['buffer', 1],      // 0
                        ['deliver', 2],     // 1
                        ['ack', -1],        // 2
                    ]
                });
                this.message = u
                this.result(2)
                this.go();
                return;
            }
            else
            {
                this.res.writeHead(200, new webres());
                this.end('Not regiestered user');
            }
            this.result(1);
            this.go();
            return;
        }

	this.list = function()
	{
	    res.end(user.listUser());
	    this.result(1);
	    this.go();
	    return;
	}
        */

    }


    cb.applyStateMachine(NodeSession)
    cb.applyCallback(NodeWeb)

    NodeWeb.prototype.launch = function()
    {
        this.server.listen(this.port, this.address)
        //    user.heartbeat()
    }

    NodeWeb.prototype.dispatch = function(req, res)
    {
        console.log('dispatch ' + req.url);
        var session = new NodeSession(req, res);
        this.sessions.push(session);
        session.start();
    }

    var web = new NodeWeb()
    web.launch()
}
)();

