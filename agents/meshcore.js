/*
Copyright 2018-2020 Intel Corporation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

process.on('uncaughtException', function (ex) {
    require('MeshAgent').SendCommand({ action: 'msg', type: 'console', value: "uncaughtException1: " + ex });
});

// NOTE: This seems to cause big problems, don't enable the debugger in the server's meshcore. 
//attachDebugger({ webport: 9999, wait: 1 }).then(function (prt) { console.log('Point Browser for Debug to port: ' + prt); });

// Mesh Rights
var MNG_ERROR = 65;
var MESHRIGHT_EDITMESH = 1;
var MESHRIGHT_MANAGEUSERS = 2;
var MESHRIGHT_MANAGECOMPUTERS = 4;
var MESHRIGHT_REMOTECONTROL = 8;
var MESHRIGHT_AGENTCONSOLE = 16;
var MESHRIGHT_SERVERFILES = 32;
var MESHRIGHT_WAKEDEVICE = 64;
var MESHRIGHT_SETNOTES = 128;
var MESHRIGHT_REMOTEVIEW = 256;
var MESHRIGHT_NOTERMINAL = 512;
var MESHRIGHT_NOFILES = 1024;
var MESHRIGHT_NOAMT = 2048;
var MESHRIGHT_LIMITEDINPUT = 4096;
var MESHRIGHT_LIMITEVENTS = 8192;
var MESHRIGHT_CHATNOTIFY = 16384;
var MESHRIGHT_UNINSTALL = 32768;
var MESHRIGHT_NODESKTOP = 65536;

function createMeshCore(agent) {
    var obj = {};
    var agentFileHttpRequests = {}; // Currently active agent HTTPS GET requests from the server.
    var agentFileHttpPendingRequests = []; // Pending HTTPS GET requests from the server.

    if (process.platform == 'win32' && require('user-sessions').isRoot()) {
        // Check the Agent Uninstall MetaData for correctness, as the installer may have written an incorrect value
        try {
            var writtenSize = 0, actualSize = Math.floor(require('fs').statSync(process.execPath).size / 1024);
            try { writtenSize = require('win-registry').QueryKey(require('win-registry').HKEY.LocalMachine, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MeshCentralAgent', 'EstimatedSize'); } catch (e) { }
            if (writtenSize != actualSize) { try { require('win-registry').WriteKey(require('win-registry').HKEY.LocalMachine, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MeshCentralAgent', 'EstimatedSize', actualSize); } catch (e) { } }
        } catch (x) { }

        // Check to see if we are the Installed Mesh Agent Service, if we are, make sure we can run in Safe Mode
        try {
            var meshCheck = false;
            try { meshCheck = require('service-manager').manager.getService('Mesh Agent').isMe(); } catch (e) { }
            if (meshCheck && require('win-bcd').isSafeModeService && !require('win-bcd').isSafeModeService('Mesh Agent')) { require('win-bcd').enableSafeModeService('Mesh Agent'); }
        } catch (e) { }
    }

    if (process.platform == 'darwin' && !process.versions) {
        // This is an older MacOS Agent, so we'll need to check the service definition so that Auto-Update will function correctly
        var child = require('child_process').execFile('/bin/sh', ['sh']);
        child.stdout.str = '';
        child.stdout.on('data', function (chunk) { this.str += chunk.toString(); });
        child.stdin.write("cat /Library/LaunchDaemons/meshagent_osx64_LaunchDaemon.plist | tr '\n' '\.' | awk '{split($0, a, \"<key>KeepAlive</key>\"); split(a[2], b, \"<\"); split(b[2], c, \">\"); ");
        child.stdin.write(" if(c[1]==\"dict\"){ split(a[2], d, \"</dict>\"); if(split(d[1], truval, \"<true/>\")>1) { split(truval[1], kn1, \"<key>\"); split(kn1[2], kn2, \"</key>\"); print kn2[1]; } }");
        child.stdin.write(" else { split(c[1], ka, \"/\"); if(ka[1]==\"true\") {print \"ALWAYS\";} } }'\nexit\n");
        child.waitExit();
        if (child.stdout.str.trim() == 'Crashed') {
            child = require('child_process').execFile('/bin/sh', ['sh']);
            child.stdout.str = '';
            child.stdout.on('data', function (chunk) { this.str += chunk.toString(); });
            child.stdin.write("launchctl list | grep 'meshagent' | awk '{ if($3==\"meshagent\"){print $1;}}'\nexit\n");
            child.waitExit();

            if (parseInt(child.stdout.str.trim()) == process.pid) {
                // The currently running MeshAgent is us, so we can continue with the update
                var plist = require('fs').readFileSync('/Library/LaunchDaemons/meshagent_osx64_LaunchDaemon.plist').toString();
                var tokens = plist.split('<key>KeepAlive</key>');
                if (tokens[1].split('>')[0].split('<')[1] == 'dict') {
                    var tmp = tokens[1].split('</dict>');
                    tmp.shift();
                    tokens[1] = '\n    <true/>' + tmp.join('</dict>');
                    tokens = tokens.join('<key>KeepAlive</key>');

                    require('fs').writeFileSync('/Library/LaunchDaemons/meshagent_osx64_LaunchDaemon.plist', tokens);

                    var fix = '';
                    fix += ("function macosRepair()\n");
                    fix += ("{\n");
                    fix += ("    var child = require('child_process').execFile('/bin/sh', ['sh']);\n");
                    fix += ("    child.stdout.str = '';\n");
                    fix += ("    child.stdout.on('data', function (chunk) { this.str += chunk.toString(); });\n");
                    fix += ("    child.stderr.on('data', function (chunk) { });\n");
                    fix += ("    child.stdin.write('launchctl unload /Library/LaunchDaemons/meshagent_osx64_LaunchDaemon.plist\\n');\n");
                    fix += ("    child.stdin.write('launchctl load /Library/LaunchDaemons/meshagent_osx64_LaunchDaemon.plist\\n');\n");
                    fix += ("    child.stdin.write('rm /Library/LaunchDaemons/meshagentRepair.plist\\n');\n");
                    fix += ("    child.stdin.write('rm " + process.cwd() + "/macosRepair.js\\n');\n");
                    fix += ("    child.stdin.write('launchctl stop meshagentRepair\\nexit\\n');\n");
                    fix += ("    child.waitExit();\n");
                    fix += ("}\n");
                    fix += ("macosRepair();\n");
                    fix += ("process.exit();\n");
                    require('fs').writeFileSync(process.cwd() + '/macosRepair.js', fix);

                    var plist = '<?xml version="1.0" encoding="UTF-8"?>\n';
                    plist += '<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';
                    plist += '<plist version="1.0">\n';
                    plist += '  <dict>\n';
                    plist += '      <key>Label</key>\n';
                    plist += ('     <string>meshagentRepair</string>\n');
                    plist += '      <key>ProgramArguments</key>\n';
                    plist += '      <array>\n';
                    plist += ('        <string>' + process.execPath + '</string>\n');
                    plist += '        <string>macosRepair.js</string>\n';
                    plist += '      </array>\n';
                    plist += '      <key>WorkingDirectory</key>\n';
                    plist += ('     <string>' + process.cwd() + '</string>\n');
                    plist += '      <key>RunAtLoad</key>\n';
                    plist += '      <true/>\n';
                    plist += '  </dict>\n';
                    plist += '</plist>';
                    require('fs').writeFileSync('/Library/LaunchDaemons/meshagentRepair.plist', plist);

                    child = require('child_process').execFile('/bin/sh', ['sh']);
                    child.stdout.str = '';
                    child.stdout.on('data', function (chunk) { this.str += chunk.toString(); });
                    child.stdin.write("launchctl load /Library/LaunchDaemons/meshagentRepair.plist\nexit\n");
                    child.waitExit();
                }
            }
        }
    }

    // Add an Intel AMT event to the log
    function addAmtEvent(msg) {
        if (obj.amtevents == null) { obj.amtevents = []; }
        var d = new Date();
        obj.amtevents.push(zeroPad(d.getHours(), 2) + ':' + zeroPad(d.getMinutes(), 2) + ':' + zeroPad(d.getSeconds(), 2) + ', ' + msg);
        if (obj.amtevents.length > 100) { obj.amtevents.splice(0, obj.amtevents.length - 100); }
    }
    function zeroPad(num, size) { var s = '000000000' + num; return s.substr(s.length - size); }


    // Create Secure IPC for Diagnostic Agent Communications
    obj.DAIPC = require('net').createServer();
    if (process.platform != 'win32') { try { require('fs').unlinkSync(process.cwd() + '/DAIPC'); } catch (e) { } }
    obj.DAIPC.IPCPATH = process.platform == 'win32' ? ('\\\\.\\pipe\\' + require('_agentNodeId')() + '-DAIPC') : (process.cwd() + '/DAIPC');
    try { obj.DAIPC.listen({ path: obj.DAIPC.IPCPATH, writableAll: true, maxConnections: 5 }); } catch (e) { }
    obj.DAIPC._daipc = [];
    obj.DAIPC.on('connection', function (c) {
        c._send = function (j) {
            var data = JSON.stringify(j);
            var packet = Buffer.alloc(data.length + 4);
            packet.writeUInt32LE(data.length + 4, 0);
            Buffer.from(data).copy(packet, 4);
            this.write(packet);
        };
        this._daipc.push(c);
        c.parent = this;
        c.on('end', function () { removeRegisteredApp(this); });
        c.on('data', function (chunk) {
            if (chunk.length < 4) { this.unshift(chunk); return; }
            var len = chunk.readUInt32LE(0);
            if (len > 8192) { removeRegisteredApp(this); this.end(); return; }
            if (chunk.length < len) { this.unshift(chunk); return; }

            var data = chunk.slice(4, len);
            try { data = JSON.parse(data.toString()); } catch (e) { }
            if ((data == null) || (typeof data.cmd != 'string')) return;

            try {
                switch (data.cmd) {
                    case 'requesthelp':
                        if (this._registered == null) return;
                        sendConsoleText('Request Help (' + this._registered + '): ' + data.value);
                        var help = {};
                        help[this._registered] = data.value;
                        try { mesh.SendCommand({ action: 'sessions', type: 'help', value: help }); } catch (e) { }
                        MeshServerLogEx(98, [this._registered, data.value], "Help Requested, user: " + this._registered + ", details: " + data.value, null);
                        break;
                    case 'cancelhelp':
                        if (this._registered == null) return;
                        sendConsoleText('Cancel Help (' + this._registered + ')');
                        try { mesh.SendCommand({ action: 'sessions', type: 'help', value: {} }); } catch (e) { }
                        break;
                    case 'register':
                        if (typeof data.value == 'string') {
                            this._registered = data.value;
                            var apps = {};
                            apps[data.value] = 1;
                            try { mesh.SendCommand({ action: 'sessions', type: 'app', value: apps }); } catch (e) { }
                            this._send({ cmd: 'serverstate', value: meshServerConnectionState, url: require('MeshAgent').ConnectedServer, amt: (amt != null) });
                        }
                        break;
                    case 'query':
                        switch (data.value) {
                            case 'connection':
                                data.result = require('MeshAgent').ConnectedServer;
                                this._send(data);
                                break;
                            case 'descriptors':
                                require('ChainViewer').getSnapshot().then(function (f) {
                                    this.tag.payload.result = f;
                                    this.tag.ipc._send(this.tag.payload);
                                }).parentPromise.tag = { ipc: this, payload: data };
                                break;
                        }
                        break;
                    case 'amtstate':
                        if (amt == null) return;
                        var func = function amtStateFunc(state) { if (state != null) { amtStateFunc.pipe._send({ cmd: 'amtstate', value: state }); } }
                        func.pipe = this;
                        amt.getMeiState(11, func);
                        break;
                    case 'sessions':
                        this._send({ cmd: 'sessions', sessions: tunnelUserCount });
                        break;
                    case 'meshToolInfo':
                        try { mesh.SendCommand({ action: 'meshToolInfo', name: data.name, hash: data.hash, cookie: data.cookie?true:false, pipe: true }); } catch (e) { }
                        break;
                }
            }
            catch (e) { removeRegisteredApp(this); this.end(); return; }
        });
    });

    // Send current sessions to registered apps
    function broadcastSessionsToRegisteredApps(x) {
        broadcastToRegisteredApps({ cmd: 'sessions', sessions: tunnelUserCount });
    }

    // Send this object to all registered local applications
    function broadcastToRegisteredApps(x) {
        if ((obj.DAIPC == null) || (obj.DAIPC._daipc == null)) return;
        for (var i in obj.DAIPC._daipc) { if (obj.DAIPC._daipc[i]._registered != null) { obj.DAIPC._daipc[i]._send(x); } }
    }

    // Send list of registered apps to the server
    function updateRegisteredAppsToServer() {
        if ((obj.DAIPC == null) || (obj.DAIPC._daipc == null)) return;
        var apps = {};
        for (var i in obj.DAIPC._daipc) { if (apps[obj.DAIPC._daipc[i]._registered] == null) { apps[obj.DAIPC._daipc[i]._registered] = 1; } else { apps[obj.DAIPC._daipc[i]._registered]++; } }
        try { mesh.SendCommand({ action: 'sessions', type: 'app', value: apps }); } catch (e) { }
    }

    // Remove a registered app
    function removeRegisteredApp(pipe) {
        for (var i = obj.DAIPC._daipc.length - 1; i >= 0; i--) { if (obj.DAIPC._daipc[i] === pipe) { obj.DAIPC._daipc.splice(i, 1); } }
        if (pipe._registered != null) updateRegisteredAppsToServer();
    }

    function diagnosticAgent_uninstall() {
        require('service-manager').manager.uninstallService('meshagentDiagnostic');
        require('task-scheduler').delete('meshagentDiagnostic/periodicStart');
    };
    function diagnosticAgent_installCheck(install) {
        try {
            var diag = require('service-manager').manager.getService('meshagentDiagnostic');
            return (diag);
        }
        catch (e) {
        }
        if (!install) { return (null); }

        var svc = null;
        try {
            require('service-manager').manager.installService(
                {
                    name: 'meshagentDiagnostic',
                    displayName: "Mesh Agent Diagnostic Service",
                    description: "Mesh Agent Diagnostic Service",
                    servicePath: process.execPath,
                    parameters: ['-recovery']
                    //files: [{ newName: 'diagnostic.js', _buffer: Buffer.from('LyoNCkNvcHlyaWdodCAyMDE5IEludGVsIENvcnBvcmF0aW9uDQoNCkxpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSAiTGljZW5zZSIpOw0KeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLg0KWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0DQoNCiAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjANCg0KVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZQ0KZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gIkFTIElTIiBCQVNJUywNCldJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLg0KU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZA0KbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuDQoqLw0KDQp2YXIgaG9zdCA9IHJlcXVpcmUoJ3NlcnZpY2UtaG9zdCcpLmNyZWF0ZSgnbWVzaGFnZW50RGlhZ25vc3RpYycpOw0KdmFyIFJlY292ZXJ5QWdlbnQgPSByZXF1aXJlKCdNZXNoQWdlbnQnKTsNCg0KaG9zdC5vbignc2VydmljZVN0YXJ0JywgZnVuY3Rpb24gKCkNCnsNCiAgICBjb25zb2xlLnNldERlc3RpbmF0aW9uKGNvbnNvbGUuRGVzdGluYXRpb25zLkxPR0ZJTEUpOw0KICAgIGhvc3Quc3RvcCA9IGZ1bmN0aW9uKCkNCiAgICB7DQogICAgICAgIHJlcXVpcmUoJ3NlcnZpY2UtbWFuYWdlcicpLm1hbmFnZXIuZ2V0U2VydmljZSgnbWVzaGFnZW50RGlhZ25vc3RpYycpLnN0b3AoKTsNCiAgICB9DQogICAgUmVjb3ZlcnlBZ2VudC5vbignQ29ubmVjdGVkJywgZnVuY3Rpb24gKHN0YXR1cykNCiAgICB7DQogICAgICAgIGlmIChzdGF0dXMgPT0gMCkNCiAgICAgICAgew0KICAgICAgICAgICAgY29uc29sZS5sb2coJ0RpYWdub3N0aWMgQWdlbnQ6IFNlcnZlciBjb25uZWN0aW9uIGxvc3QuLi4nKTsNCiAgICAgICAgICAgIHJldHVybjsNCiAgICAgICAgfQ0KICAgICAgICBjb25zb2xlLmxvZygnRGlhZ25vc3RpYyBBZ2VudDogQ29ubmVjdGlvbiBFc3RhYmxpc2hlZCB3aXRoIFNlcnZlcicpOw0KICAgICAgICBzdGFydCgpOw0KICAgIH0pOw0KfSk7DQpob3N0Lm9uKCdub3JtYWxTdGFydCcsIGZ1bmN0aW9uICgpDQp7DQogICAgaG9zdC5zdG9wID0gZnVuY3Rpb24gKCkNCiAgICB7DQogICAgICAgIHByb2Nlc3MuZXhpdCgpOw0KICAgIH0NCiAgICBjb25zb2xlLmxvZygnTm9uIFNlcnZpY2UgTW9kZScpOw0KICAgIFJlY292ZXJ5QWdlbnQub24oJ0Nvbm5lY3RlZCcsIGZ1bmN0aW9uIChzdGF0dXMpDQogICAgew0KICAgICAgICBpZiAoc3RhdHVzID09IDApDQogICAgICAgIHsNCiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdEaWFnbm9zdGljIEFnZW50OiBTZXJ2ZXIgY29ubmVjdGlvbiBsb3N0Li4uJyk7DQogICAgICAgICAgICByZXR1cm47DQogICAgICAgIH0NCiAgICAgICAgY29uc29sZS5sb2coJ0RpYWdub3N0aWMgQWdlbnQ6IENvbm5lY3Rpb24gRXN0YWJsaXNoZWQgd2l0aCBTZXJ2ZXInKTsNCiAgICAgICAgc3RhcnQoKTsNCiAgICB9KTsNCn0pOw0KaG9zdC5vbignc2VydmljZVN0b3AnLCBmdW5jdGlvbiAoKSB7IHByb2Nlc3MuZXhpdCgpOyB9KTsNCmhvc3QucnVuKCk7DQoNCg0KZnVuY3Rpb24gc3RhcnQoKQ0Kew0KDQp9Ow0K', 'base64') }]
                });
            svc = require('service-manager').manager.getService('meshagentDiagnostic');
        }
        catch (e) {
            return (null);
        }
        var proxyConfig = require('global-tunnel').proxyConfig;
        var cert = require('MeshAgent').GenerateAgentCertificate('CN=MeshNodeDiagnosticCertificate');
        var nodeid = require('tls').loadCertificate(cert.root).getKeyHash().toString('base64');
        ddb = require('SimpleDataStore').Create(svc.appWorkingDirectory().replace('\\', '/') + '/meshagentDiagnostic.db');
        ddb.Put('disableUpdate', '1');
        ddb.Put('MeshID', Buffer.from(require('MeshAgent').ServerInfo.MeshID, 'hex'));
        ddb.Put('ServerID', require('MeshAgent').ServerInfo.ServerID);
        ddb.Put('MeshServer', require('MeshAgent').ServerInfo.ServerUri);
        if (cert.root.pfx) { ddb.Put('SelfNodeCert', cert.root.pfx); }
        if (cert.tls) { ddb.Put('SelfNodeTlsCert', cert.tls.pfx); }
        if (proxyConfig) {
            ddb.Put('WebProxy', proxyConfig.host + ':' + proxyConfig.port);
        } else {
            ddb.Put('ignoreProxyFile', '1');
        }

        require('MeshAgent').SendCommand({ action: 'diagnostic', value: { command: 'register', value: nodeid } });
        require('MeshAgent').SendCommand({ action: 'msg', type: 'console', value: "Diagnostic Agent Registered [" + nodeid.length + "/" + nodeid + "]" });

        delete ddb;

        // Set a recurrent task, to run the Diagnostic Agent every 2 days
        require('task-scheduler').create({ name: 'meshagentDiagnostic/periodicStart', daily: 2, time: require('tls').generateRandomInteger('0', '23') + ':' + require('tls').generateRandomInteger('0', '59').padStart(2, '0'), service: 'meshagentDiagnostic' });
        //require('task-scheduler').create({ name: 'meshagentDiagnostic/periodicStart', daily: '1', time: '17:16', service: 'meshagentDiagnostic' });

        return (svc);
    }

    // Monitor the file 'batterystate.txt' in the agent's folder and sends battery update when this file is changed.
    if ((require('fs').existsSync(process.cwd() + 'batterystate.txt')) && (require('fs').watch != null)) {
        // Setup manual battery monitoring
        require('MeshAgent')._batteryFileWatcher = require('fs').watch(process.cwd(), function () {
            if (require('MeshAgent')._batteryFileTimer != null) return;
            require('MeshAgent')._batteryFileTimer = setTimeout(function () {
                try {
                    require('MeshAgent')._batteryFileTimer = null;
                    var data = null;
                    try { data = require('fs').readFileSync(process.cwd() + 'batterystate.txt').toString(); } catch (e) { }
                    if ((data != null) && (data.length < 10)) {
                        data = data.split(',');
                        if ((data.length == 2) && ((data[0] == 'ac') || (data[0] == 'dc'))) {
                            var level = parseInt(data[1]);
                            if ((level >= 0) && (level <= 100)) { require('MeshAgent').SendCommand({ action: 'battery', state: data[0], level: level }); }
                        }
                    }
                } catch (e) { }
            }, 1000);
        });
    } else {
        // Setup normal battery monitoring
        if (require('identifiers').isBatteryPowered && require('identifiers').isBatteryPowered()) {
            require('MeshAgent')._battLevelChanged = function _battLevelChanged(val) {
                _battLevelChanged.self._currentBatteryLevel = val;
                _battLevelChanged.self.SendCommand({ action: 'battery', state: _battLevelChanged.self._currentPowerState, level: val });
            };
            require('MeshAgent')._battLevelChanged.self = require('MeshAgent');
            require('MeshAgent')._powerChanged = function _powerChanged(val) {
                _powerChanged.self._currentPowerState = (val == 'AC' ? 'ac' : 'dc');
                _powerChanged.self.SendCommand({ action: 'battery', state: (val == 'AC' ? 'ac' : 'dc'), level: _powerChanged.self._currentBatteryLevel });
            };
            require('MeshAgent')._powerChanged.self = require('MeshAgent');
            require('MeshAgent').on('Connected', function (status) {
                if (status == 0) {
                    require('power-monitor').removeListener('acdc', this._powerChanged);
                    require('power-monitor').removeListener('batteryLevel', this._battLevelChanged);
                } else {
                    require('power-monitor').on('acdc', this._powerChanged);
                    require('power-monitor').on('batteryLevel', this._battLevelChanged);
                }
            });
        }
    }


    /*
    function borderController() {
        this.container = null;
        this.Start = function Start(user) {
            if (this.container == null) {
                if (process.platform == 'win32') {
                    try {
                        this.container = require('ScriptContainer').Create({ processIsolation: 1, sessionId: user.SessionId });
                    } catch (e) {
                        this.container = require('ScriptContainer').Create({ processIsolation: 1 });
                    }
                } else {
                    this.container = require('ScriptContainer').Create({ processIsolation: 1, sessionId: user.uid });
                }
                this.container.parent = this;
                this.container.addModule('monitor-info', getJSModule('monitor-info'));
                this.container.addModule('monitor-border', getJSModule('monitor-border'));
                this.container.addModule('promise', getJSModule('promise'));
                this.container.once('exit', function (code) { sendConsoleText('Border Process Exited with code: ' + code); this.parent.container = this.parent._container = null; });
                this.container.ExecuteString("var border = require('monitor-border'); border.Start();");
            }
        }
        this.Stop = function Stop() {
            if (this.container != null) {
                this._container = this.container;
                this._container.parent = this;
                this.container = null;
                this._container.exit();
            }
        }
    }
    obj.borderManager = new borderController();
    */

    // MeshAgent JavaScript Core Module. This code is sent to and running on the mesh agent.
    var meshCoreObj = { action: 'coreinfo', value: (require('MeshAgent').coreHash ? ('MeshCore CRC-' + crc32c(require('MeshAgent').coreHash)) : ('MeshCore v6')), caps: 14, root: require('user-sessions').isRoot() }; // Capability bitmask: 1 = Desktop, 2 = Terminal, 4 = Files, 8 = Console, 16 = JavaScript, 32 = Temporary Agent, 64 = Recovery Agent

    // Get the operating system description string
    try { require('os').name().then(function (v) { meshCoreObj.osdesc = v; meshCoreObjChanged(); }); } catch (e) { }

    // Setup logged in user monitoring (THIS IS BROKEN IN WIN7)
    try {
        var userSession = require('user-sessions');
        userSession.on('changed', function onUserSessionChanged() {
            userSession.enumerateUsers().then(function (users) {
                var u = [], a = users.Active;
                for (var i = 0; i < a.length; i++) {
                    var un = a[i].Domain ? (a[i].Domain + '\\' + a[i].Username) : (a[i].Username);
                    if (u.indexOf(un) == -1) { u.push(un); } // Only push users in the list once.
                }
                meshCoreObj.users = u;
                meshCoreObjChanged();
            });
        });
        userSession.emit('changed');
        //userSession.on('locked', function (user) { sendConsoleText('[' + (user.Domain ? user.Domain + '\\' : '') + user.Username + '] has LOCKED the desktop'); });
        //userSession.on('unlocked', function (user) { sendConsoleText('[' + (user.Domain ? user.Domain + '\\' : '') + user.Username + '] has UNLOCKED the desktop'); });
    } catch (e) { }

    var meshServerConnectionState = 0;
    var tunnels = {};
    var lastNetworkInfo = null;
    var lastPublicLocationInfo = null;
    var selfInfoUpdateTimer = null;
    var http = require('http');
    var net = require('net');
    var fs = require('fs');
    var rtc = require('ILibWebRTC');
    var amt = null;
    var processManager = require('process-manager');
    var wifiScannerLib = null;
    var wifiScanner = null;
    var networkMonitor = null;
    var nextTunnelIndex = 1;
    var apftunnel = null;
    var tunnelUserCount = { terminal: {}, files: {}, tcp: {}, udp: {}, msg: {} }; // List of userid->count sessions for terminal, files and TCP/UDP routing

    // Add to the server event log
    function MeshServerLog(msg, state) {
        if (typeof msg == 'string') { msg = { action: 'log', msg: msg }; } else { msg.action = 'log'; }
        if (state) {
            if (state.userid) { msg.userid = state.userid; }
            if (state.username) { msg.username = state.username; }
            if (state.sessionid) { msg.sessionid = state.sessionid; }
            if (state.remoteaddr) { msg.remoteaddr = state.remoteaddr; }
        }
        mesh.SendCommand(msg);
    }

    // Add to the server event log, use internationalized events
    function MeshServerLogEx(id, args, msg, state) {
        var msg = { action: 'log', msgid: id, msgArgs: args, msg: msg };
        if (state) {
            if (state.userid) { msg.userid = state.userid; }
            if (state.username) { msg.username = state.username; }
            if (state.sessionid) { msg.sessionid = state.sessionid; }
            if (state.remoteaddr) { msg.remoteaddr = state.remoteaddr; }
        }
        mesh.SendCommand(msg);
    }

    // If we are running in Duktape, agent will be null
    if (agent == null) {
        // Running in native agent, Import libraries
        db = require('SimpleDataStore').Shared();
        sha = require('SHA256Stream');
        mesh = require('MeshAgent');
        childProcess = require('child_process');
        if (mesh.hasKVM == 1) { // if the agent is compiled with KVM support
            // Check if this computer supports a desktop
            try
            {
                if ((process.platform == 'win32') || (process.platform == 'darwin') || (require('monitor-info').kvm_x11_support)) {
                    meshCoreObj.caps |= 1; meshCoreObjChanged();
                } else if (process.platform == 'linux' || process.platform == 'freebsd') {
                    require('monitor-info').on('kvmSupportDetected', function (value) { meshCoreObj.caps |= 1; meshCoreObjChanged(); });
                }
            } catch (e) { }
        }
    } else {
        // Running in nodejs
        meshCoreObj.value += '-NodeJS';
        meshCoreObj.caps = 8;
        mesh = agent.getMeshApi();
    }

    mesh.DAIPC = obj.DAIPC;

    /*
    // Try to load up the network monitor
    try {
        networkMonitor = require('NetworkMonitor');
        networkMonitor.on('change', function () { sendNetworkUpdateNagle(); });
        networkMonitor.on('add', function (addr) { sendNetworkUpdateNagle(); });
        networkMonitor.on('remove', function (addr) { sendNetworkUpdateNagle(); });
    } catch (e) { networkMonitor = null; }
    */

    // Fetch the SMBios Tables
    var SMBiosTables = null;
    var SMBiosTablesRaw = null;
    try {
        var SMBiosModule = null;
        try { SMBiosModule = require('smbios'); } catch (e) { }
        if (SMBiosModule != null) {
            SMBiosModule.get(function (data) {
                if (data != null) {
                    SMBiosTablesRaw = data;
                    SMBiosTables = require('smbios').parse(data)
                    if (mesh.isControlChannelConnected) { mesh.SendCommand({ action: 'smbios', value: SMBiosTablesRaw }); }

                    // If SMBios tables say that Intel AMT is present, try to connect MEI
                    if (SMBiosTables.amtInfo && (SMBiosTables.amtInfo.AMT == true))
                    {
                        var amtmodule = require('amt-manage');
                        amt = new amtmodule(mesh, db, false);
                        amt.on('portBinding_LMS', function (map) { mesh.SendCommand({ action: 'lmsinfo', value: { ports: map.keys() } }); });
                        amt.on('stateChange_LMS', function (v) { if (!meshCoreObj.intelamt) { meshCoreObj.intelamt = {}; } meshCoreObj.intelamt.microlms = v; meshCoreObjChanged(); }); // 0 = Disabled, 1 = Connecting, 2 = Connected
                        amt.onStateChange = function (state) { if (state == 2) { sendPeriodicServerUpdate(1); } } // MEI State
                        amt.reset();
                    }
                }
            });
        }
    } catch (e) { sendConsoleText("ex1: " + e); }

    // Try to load up the WIFI scanner
    try {
        var wifiScannerLib = require('wifi-scanner');
        wifiScanner = new wifiScannerLib();
        wifiScanner.on('accessPoint', function (data) { sendConsoleText("wifiScanner: " + data); });
    } catch (e) { wifiScannerLib = null; wifiScanner = null; }

    // Get our location (lat/long) using our public IP address
    var getIpLocationDataExInProgress = false;
    var getIpLocationDataExCounts = [0, 0];
    function getIpLocationDataEx(func) {
        if (getIpLocationDataExInProgress == true) { return false; }
        try {
            getIpLocationDataExInProgress = true;
            getIpLocationDataExCounts[0]++;
            var options = http.parseUri("http://ipinfo.io/json");
            options.method = 'GET';
            http.request(options, function (resp) {
                if (resp.statusCode == 200) {
                    var geoData = '';
                    resp.data = function (geoipdata) { geoData += geoipdata; };
                    resp.end = function () {
                        var location = null;
                        try {
                            if (typeof geoData == 'string') {
                                var result = JSON.parse(geoData);
                                if (result.ip && result.loc) { location = result; }
                            }
                        } catch (e) { }
                        if (func) { getIpLocationDataExCounts[1]++; func(location); }
                    }
                } else { func(null); }
                getIpLocationDataExInProgress = false;
            }).end();
            return true;
        }
        catch (e) { return false; }
    }

    // Remove all Gateway MAC addresses for interface list. This is useful because the gateway MAC is not always populated reliably.
    function clearGatewayMac(str) {
        if (str == null) return null;
        var x = JSON.parse(str);
        for (var i in x.netif) { if (x.netif[i].gatewaymac) { delete x.netif[i].gatewaymac } }
        return JSON.stringify(x);
    }

    function getIpLocationData(func) {
        // Get the location information for the cache if possible
        var publicLocationInfo = db.Get('publicLocationInfo');
        if (publicLocationInfo != null) { publicLocationInfo = JSON.parse(publicLocationInfo); }
        if (publicLocationInfo == null) {
            // Nothing in the cache, fetch the data
            getIpLocationDataEx(function (locationData) {
                if (locationData != null) {
                    publicLocationInfo = {};
                    publicLocationInfo.netInfoStr = lastNetworkInfo;
                    publicLocationInfo.locationData = locationData;
                    var x = db.Put('publicLocationInfo', JSON.stringify(publicLocationInfo)); // Save to database
                    if (func) func(locationData); // Report the new location
                } else {
                    if (func) func(null); // Report no location
                }
            });
        } else {
            // Check the cache
            if (clearGatewayMac(publicLocationInfo.netInfoStr) == clearGatewayMac(lastNetworkInfo)) {
                // Cache match
                if (func) func(publicLocationInfo.locationData);
            } else {
                // Cache mismatch
                getIpLocationDataEx(function (locationData) {
                    if (locationData != null) {
                        publicLocationInfo = {};
                        publicLocationInfo.netInfoStr = lastNetworkInfo;
                        publicLocationInfo.locationData = locationData;
                        var x = db.Put('publicLocationInfo', JSON.stringify(publicLocationInfo)); // Save to database
                        if (func) func(locationData); // Report the new location
                    } else {
                        if (func) func(publicLocationInfo.locationData); // Can't get new location, report the old location
                    }
                });
            }
        }
    }

    // Polyfill String.endsWith
    if (!String.prototype.endsWith) {
        String.prototype.endsWith = function (searchString, position) {
            var subjectString = this.toString();
            if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) { position = subjectString.length; }
            position -= searchString.length;
            var lastIndex = subjectString.lastIndexOf(searchString, position);
            return lastIndex !== -1 && lastIndex === position;
        };
    }

    // Polyfill path.join
    obj.path = {
        join: function () {
            var x = [];
            for (var i in arguments) {
                var w = arguments[i];
                if (w != null) {
                    while (w.endsWith('/') || w.endsWith('\\')) { w = w.substring(0, w.length - 1); }
                    if (i != 0) {
                        while (w.startsWith('/') || w.startsWith('\\')) { w = w.substring(1); }
                    }
                    x.push(w);
                }
            }
            if (x.length == 0) return '/';
            return x.join('/');
        }
    };

    // Replace a string with a number if the string is an exact number
    function toNumberIfNumber(x) { if ((typeof x == 'string') && (+parseInt(x) === x)) { x = parseInt(x); } return x; }

    // Convert decimal to hex
    function char2hex(i) { return (i + 0x100).toString(16).substr(-2).toUpperCase(); }

    // Convert a raw string to a hex string
    function rstr2hex(input) { var r = '', i; for (i = 0; i < input.length; i++) { r += char2hex(input.charCodeAt(i)); } return r; }

    // Convert a buffer into a string
    function buf2rstr(buf) { var r = ''; for (var i = 0; i < buf.length; i++) { r += String.fromCharCode(buf[i]); } return r; }

    // Convert a hex string to a raw string // TODO: Do this using Buffer(), will be MUCH faster
    function hex2rstr(d) {
        if (typeof d != "string" || d.length == 0) return '';
        var r = '', m = ('' + d).match(/../g), t;
        while (t = m.shift()) r += String.fromCharCode('0x' + t);
        return r
    }

    // Convert an object to string with all functions
    function objToString(x, p, pad, ret) {
        if (ret == undefined) ret = '';
        if (p == undefined) p = 0;
        if (x == null) { return '[null]'; }
        if (p > 8) { return '[...]'; }
        if (x == undefined) { return '[undefined]'; }
        if (typeof x == 'string') { if (p == 0) return x; return '"' + x + '"'; }
        if (typeof x == 'buffer') { return '[buffer]'; }
        if (typeof x != 'object') { return x; }
        var r = '{' + (ret ? '\r\n' : ' ');
        for (var i in x) { if (i != '_ObjectID') { r += (addPad(p + 2, pad) + i + ': ' + objToString(x[i], p + 2, pad, ret) + (ret ? '\r\n' : ' ')); } }
        return r + addPad(p, pad) + '}';
    }

    // Return p number of spaces 
    function addPad(p, ret) { var r = ''; for (var i = 0; i < p; i++) { r += ret; } return r; }

    // Split a string taking into account the quoats. Used for command line parsing
    function splitArgs(str) {
        var myArray = [], myRegexp = /[^\s"]+|"([^"]*)"/gi;
        do { var match = myRegexp.exec(str); if (match != null) { myArray.push(match[1] ? match[1] : match[0]); } } while (match != null);
        return myArray;
    }

    // Parse arguments string array into an object
    function parseArgs(argv) {
        var results = { '_': [] }, current = null;
        for (var i = 1, len = argv.length; i < len; i++) {
            var x = argv[i];
            if (x.length > 2 && x[0] == '-' && x[1] == '-') {
                if (current != null) { results[current] = true; }
                current = x.substring(2);
            } else {
                if (current != null) { results[current] = toNumberIfNumber(x); current = null; } else { results['_'].push(toNumberIfNumber(x)); }
            }
        }
        if (current != null) { results[current] = true; }
        return results;
    }

    // Get server target url with a custom path
    function getServerTargetUrl(path) {
        var x = mesh.ServerUrl;
        //sendConsoleText("mesh.ServerUrl: " + mesh.ServerUrl);
        if (x == null) { return null; }
        if (path == null) { path = ''; }
        x = http.parseUri(x);
        if (x == null) return null;
        return x.protocol + '//' + x.host + ':' + x.port + '/' + path;
    }

    // Get server url. If the url starts with "*/..." change it, it not use the url as is.
    function getServerTargetUrlEx(url) {
        if (url.substring(0, 2) == '*/') { return getServerTargetUrl(url.substring(2)); }
        return url;
    }

    // Send a wake-on-lan packet
    function sendWakeOnLan(hexMac) {
        hexMac = hexMac.split(':').join('');
        var count = 0;
        try {
            var interfaces = require('os').networkInterfaces();
            var magic = 'FFFFFFFFFFFF';
            for (var x = 1; x <= 16; ++x) { magic += hexMac; }
            var magicbin = Buffer.from(magic, 'hex');

            for (var adapter in interfaces) {
                if (interfaces.hasOwnProperty(adapter)) {
                    for (var i = 0; i < interfaces[adapter].length; ++i) {
                        var addr = interfaces[adapter][i];
                        if ((addr.family == 'IPv4') && (addr.mac != '00:00:00:00:00:00')) {
                            try {
                                var socket = require('dgram').createSocket({ type: 'udp4' });
                                socket.bind({ address: addr.address });
                                socket.setBroadcast(true);
                                socket.setMulticastInterface(addr.address);
                                socket.setMulticastTTL(1);
                                socket.send(magicbin, 7, '255.255.255.255');
                                socket.descriptorMetadata = 'WoL (' + addr.address + ' => ' + hexMac + ')';
                                count++;
                            }
                            catch (e) { }
                        }
                    }
                }
            }
        } catch (e) { }
        return count;
    }

    // Handle a mesh agent command
    function handleServerCommand(data) {
        if (typeof data == 'object') {
            // If this is a console command, parse it and call the console handler
            switch (data.action) {
                case 'msg': {
                    switch (data.type) {
                        case 'console': { // Process a console command
                            if (data.value && data.sessionid) {
                                MeshServerLogEx(17, [data.value], "Processing console command: " + data.value, data);
                                var args = splitArgs(data.value);
                                processConsoleCommand(args[0].toLowerCase(), parseArgs(args), data.rights, data.sessionid);
                            }
                            break;
                        }
                        case 'tunnel': {
                            if (data.value != null) { // Process a new tunnel connection request
                                // Create a new tunnel object
                                var xurl = getServerTargetUrlEx(data.value);
                                if (xurl != null) {
                                    xurl = xurl.split('$').join('%24').split('@').join('%40'); // Escape the $ and @ characters
                                    var woptions = http.parseUri(xurl);
                                    woptions.perMessageDeflate = false;
                                    if (typeof data.perMessageDeflate == 'boolean') { woptions.perMessageDeflate = data.perMessageDeflate; }

                                    // Perform manual server TLS certificate checking based on the certificate hash given by the server.
                                    woptions.rejectUnauthorized = 0;
                                    woptions.checkServerIdentity = function checkServerIdentity(certs) { if ((checkServerIdentity.servertlshash != null) && (checkServerIdentity.servertlshash != certs[0].digest.split(':').join('').toLowerCase())) { throw new Error('BadCert') } }
                                    woptions.checkServerIdentity.servertlshash = data.servertlshash;

                                    //sendConsoleText(JSON.stringify(woptions));
                                    //sendConsoleText('TUNNEL: ' + JSON.stringify(data));
                                    var tunnel = http.request(woptions);
                                    tunnel.upgrade = onTunnelUpgrade;
                                    tunnel.on('error', function (e) { sendConsoleText("ERROR: Unable to connect relay tunnel to: " + this.url + ", " + JSON.stringify(e)); });
                                    tunnel.sessionid = data.sessionid;
                                    tunnel.rights = data.rights;
                                    tunnel.consent = data.consent;
                                    tunnel.privacybartext = data.privacybartext ? data.privacybartext : "Sharing desktop with: {0}";
                                    tunnel.username = data.username + (data.guestname ? (' - ' + data.guestname) : '');
                                    tunnel.realname = (data.realname ? data.realname : data.username) + (data.guestname ? (' - ' + data.guestname) : '');
                                    tunnel.userid = data.userid;
                                    tunnel.remoteaddr = data.remoteaddr;
                                    tunnel.state = 0;
                                    tunnel.url = xurl;
                                    tunnel.protocol = 0;
                                    tunnel.soptions = data.soptions;
                                    tunnel.tcpaddr = data.tcpaddr;
                                    tunnel.tcpport = data.tcpport;
                                    tunnel.udpaddr = data.udpaddr;
                                    tunnel.udpport = data.udpport;
                                    tunnel.end();
                                    // Put the tunnel in the tunnels list
                                    var index = nextTunnelIndex++;
                                    tunnel.index = index;
                                    tunnels[index] = tunnel;

                                    //sendConsoleText('New tunnel connection #' + index + ': ' + tunnel.url + ', rights: ' + tunnel.rights, data.sessionid);
                                }
                            }
                            break;
                        }
                        case 'messagebox': {
                            // Display a message box
                            if (data.title && data.msg) {
                                MeshServerLogEx(18, [data.title, data.msg], "Displaying message box, title=" + data.title + ", message=" + data.msg, data);
                                data.msg = data.msg.split('\r').join('\\r').split('\n').join('\\n');
                                try { require('message-box').create(data.title, data.msg, 120); } catch (e) { }
                            }
                            break;
                        }
                        case 'ps': {
                            // Return the list of running processes
                            if (data.sessionid) {
                                processManager.getProcesses(function (plist) {
                                    mesh.SendCommand({ action: 'msg', type: 'ps', value: JSON.stringify(plist), sessionid: data.sessionid });
                                });
                            }
                            break;
                        }
                        case 'pskill': {
                            // Kill a process
                            if (data.value) {
                                MeshServerLogEx(19, [data.value], "Killing process " + data.value, data);
                                try { process.kill(data.value); } catch (e) { sendConsoleText("pskill: " + JSON.stringify(e)); }
                            }
                            break;
                        }
                        case 'services': {
                            // Return the list of installed services
                            var services = null;
                            try { services = require('service-manager').manager.enumerateService(); } catch (e) { }
                            if (services != null) { mesh.SendCommand({ action: 'msg', type: 'services', value: JSON.stringify(services), sessionid: data.sessionid }); }
                            break;
                        }
                        case 'serviceStop': {
                            // Stop a service
                            try {
                                var service = require('service-manager').manager.getService(data.serviceName);
                                if (service != null) { service.stop(); }
                            } catch (e) { }
                            break;
                        }
                        case 'serviceStart': {
                            // Start a service
                            try {
                                var service = require('service-manager').manager.getService(data.serviceName);
                                if (service != null) { service.start(); }
                            } catch (e) { }
                            break;
                        }
                        case 'serviceRestart': {
                            // Restart a service
                            try {
                                var service = require('service-manager').manager.getService(data.serviceName);
                                if (service != null) { service.restart(); }
                            } catch (e) { }
                            break;
                        }
                        case 'deskBackground':
                            {
                                // Toggle desktop background
                                try {
                                    if (process.platform == 'win32') {
                                        var stype = require('user-sessions').getProcessOwnerName(process.pid).tsid == 0 ? 1 : 0;
                                        var sid = undefined;
                                        if (stype == 1) {
                                            if (require('MeshAgent')._tsid != null) {
                                                stype = 5;
                                                sid = require('MeshAgent')._tsid;
                                            }
                                        }
                                        var id = require('user-sessions').getProcessOwnerName(process.pid).tsid == 0 ? 1 : 0;
                                        var child = require('child_process').execFile(process.execPath, [process.execPath.split('\\').pop(), '-b64exec', 'dmFyIFNQSV9HRVRERVNLV0FMTFBBUEVSID0gMHgwMDczOwp2YXIgU1BJX1NFVERFU0tXQUxMUEFQRVIgPSAweDAwMTQ7CnZhciBHTSA9IHJlcXVpcmUoJ19HZW5lcmljTWFyc2hhbCcpOwp2YXIgdXNlcjMyID0gR00uQ3JlYXRlTmF0aXZlUHJveHkoJ3VzZXIzMi5kbGwnKTsKdXNlcjMyLkNyZWF0ZU1ldGhvZCgnU3lzdGVtUGFyYW1ldGVyc0luZm9BJyk7CgppZiAocHJvY2Vzcy5hcmd2Lmxlbmd0aCA9PSAzKQp7CiAgICB2YXIgdiA9IEdNLkNyZWF0ZVZhcmlhYmxlKDEwMjQpOwogICAgdXNlcjMyLlN5c3RlbVBhcmFtZXRlcnNJbmZvQShTUElfR0VUREVTS1dBTExQQVBFUiwgdi5fc2l6ZSwgdiwgMCk7CiAgICBjb25zb2xlLmxvZyh2LlN0cmluZyk7CiAgICBwcm9jZXNzLmV4aXQoKTsKfQplbHNlCnsKICAgIHZhciBuYiA9IEdNLkNyZWF0ZVZhcmlhYmxlKHByb2Nlc3MuYXJndlszXSk7CiAgICB1c2VyMzIuU3lzdGVtUGFyYW1ldGVyc0luZm9BKFNQSV9TRVRERVNLV0FMTFBBUEVSLCBuYi5fc2l6ZSwgbmIsIDApOwogICAgcHJvY2Vzcy5leGl0KCk7Cn0='], { type: stype, uid: sid });
                                        child.stdout.str = ''; child.stdout.on('data', function (c) { this.str += c.toString(); });
                                        child.stderr.on('data', function () { });
                                        child.waitExit();
                                        var current = child.stdout.str.trim();
                                        if (current != '') { require('MeshAgent')._wallpaper = current; }
                                        child = require('child_process').execFile(process.execPath, [process.execPath.split('\\').pop(), '-b64exec', 'dmFyIFNQSV9HRVRERVNLV0FMTFBBUEVSID0gMHgwMDczOwp2YXIgU1BJX1NFVERFU0tXQUxMUEFQRVIgPSAweDAwMTQ7CnZhciBHTSA9IHJlcXVpcmUoJ19HZW5lcmljTWFyc2hhbCcpOwp2YXIgdXNlcjMyID0gR00uQ3JlYXRlTmF0aXZlUHJveHkoJ3VzZXIzMi5kbGwnKTsKdXNlcjMyLkNyZWF0ZU1ldGhvZCgnU3lzdGVtUGFyYW1ldGVyc0luZm9BJyk7CgppZiAocHJvY2Vzcy5hcmd2Lmxlbmd0aCA9PSAzKQp7CiAgICB2YXIgdiA9IEdNLkNyZWF0ZVZhcmlhYmxlKDEwMjQpOwogICAgdXNlcjMyLlN5c3RlbVBhcmFtZXRlcnNJbmZvQShTUElfR0VUREVTS1dBTExQQVBFUiwgdi5fc2l6ZSwgdiwgMCk7CiAgICBjb25zb2xlLmxvZyh2LlN0cmluZyk7CiAgICBwcm9jZXNzLmV4aXQoKTsKfQplbHNlCnsKICAgIHZhciBuYiA9IEdNLkNyZWF0ZVZhcmlhYmxlKHByb2Nlc3MuYXJndlszXSk7CiAgICB1c2VyMzIuU3lzdGVtUGFyYW1ldGVyc0luZm9BKFNQSV9TRVRERVNLV0FMTFBBUEVSLCBuYi5fc2l6ZSwgbmIsIDApOwogICAgcHJvY2Vzcy5leGl0KCk7Cn0=', current != '' ? '""' : require('MeshAgent')._wallpaper], { type: stype, uid: sid });
                                        child.stdout.str = ''; child.stdout.on('data', function (c) { this.str += c.toString(); });
                                        child.stderr.on('data', function () { });
                                        child.waitExit();
                                    } else {
                                        var id = require('user-sessions').consoleUid();
                                        var current = require('linux-gnome-helpers').getDesktopWallpaper(id);
                                        if (current != '/dev/null') { require('MeshAgent')._wallpaper = current; }
                                        require('linux-gnome-helpers').setDesktopWallpaper(id, current != '/dev/null' ? undefined : require('MeshAgent')._wallpaper);
                                    }
                                } catch (e) {
                                    sendConsoleText(e);
                                }
                                break;
                            }
                        case 'openUrl': {
                            // Open a local web browser and return success/fail
                            MeshServerLogEx(20, [data.url], "Opening: " + data.url, data);
                            sendConsoleText("OpenURL: " + data.url);
                            if (data.url) { mesh.SendCommand({ action: 'msg', type: 'openUrl', url: data.url, sessionid: data.sessionid, success: (openUserDesktopUrl(data.url) != null) }); }
                            break;
                        }
                        case 'getclip': {
                            // Send the load clipboard back to the user
                            //sendConsoleText('getClip: ' + JSON.stringify(data));
                            if (require('MeshAgent').isService) {
                                require('clipboard').dispatchRead().then(function (str) {
                                    if (str) {
                                        MeshServerLogEx(21, [str.length], "Getting clipboard content, " + str.length + " byte(s)", data);
                                        mesh.SendCommand({ action: 'msg', type: 'getclip', sessionid: data.sessionid, data: str, tag: data.tag });
                                    }
                                });
                            } else {
                                require("clipboard").read().then(function (str) {
                                    if (str) {
                                        MeshServerLogEx(21, [str.length], "Getting clipboard content, " + str.length + " byte(s)", data);
                                        mesh.SendCommand({ action: 'msg', type: 'getclip', sessionid: data.sessionid, data: str, tag: data.tag });
                                    }
                                });
                            }
                            break;
                        }
                        case 'setclip': {
                            // Set the load clipboard to a user value
                            //sendConsoleText('setClip: ' + JSON.stringify(data));
                            if (typeof data.data == 'string') {
                                MeshServerLogEx(22, [data.data.length], "Setting clipboard content, " + data.data.length + " byte(s)", data);
                                if (require('MeshAgent').isService) { require('clipboard').dispatchWrite(data.data); } else { require("clipboard")(data.data); } // Set the clipboard
                                mesh.SendCommand({ action: 'msg', type: 'setclip', sessionid: data.sessionid, success: true });
                            }
                            break;
                        }
                        case 'userSessions': {
                            // Send back current user sessions list, this is Windows only.
                            //sendConsoleText('userSessions: ' + JSON.stringify(data));
                            if (process.platform != 'win32') break;
                            var p = require('user-sessions').enumerateUsers();
                            p.sessionid = data.sessionid;
                            p.then(function (u) { mesh.SendCommand({ action: 'msg', type: 'userSessions', sessionid: data.sessionid, data: u, tag: data.tag }); });
                            break;
                        }
                        default:
                            // Unknown action, ignore it.
                            break;
                    }
                    break;
                }
                case 'acmactivate': {
                    if (amt != null) {
                        MeshServerLogEx(23, null, "Attempting Intel AMT ACM mode activation", data);
                        amt.setAcmResponse(data);
                    }
                    break;
                }
                case 'wakeonlan': {
                    // Send wake-on-lan on all interfaces for all MAC addresses in data.macs array. The array is a list of HEX MAC addresses.
                    sendConsoleText("Server requesting wake-on-lan for: " + data.macs.join(', '));
                    for (var i in data.macs) { sendWakeOnLan(data.macs[i]); }
                    break;
                }
                case 'runcommands': {
                    if (mesh.cmdchild != null) { sendConsoleText("Run commands can't execute, already busy."); break; }
                    sendConsoleText("Run commands (" + data.runAsUser + "): " + data.cmds);

                    // data.runAsUser: 0=Agent,1=UserOrAgent,2=UserOnly
                    var options = {};
                    if (data.runAsUser > 0) {
                        try { options.uid = require('user-sessions').consoleUid(); } catch (e) { }
                        options.type = require('child_process').SpawnTypes.TERM;
                    }
                    if (data.runAsUser == 2) {
                        if (options.uid == null) break;
                        if (((require('user-sessions').minUid != null) && (options.uid < require('user-sessions').minUid()))) break; // This command can only run as user.
                    }

                    if (process.platform == 'win32') {
                        if (data.type == 1) {
                            // Windows command shell
                            mesh.cmdchild = require('child_process').execFile(process.env['windir'] + '\\system32\\cmd.exe', ['cmd'], options);
                            mesh.cmdchild.descriptorMetadata = 'UserCommandsShell';
                            mesh.cmdchild.stdout.on('data', function (c) { sendConsoleText(c.toString()); });
                            mesh.cmdchild.stderr.on('data', function (c) { sendConsoleText(c.toString()); });
                            mesh.cmdchild.stdin.write(data.cmds + '\r\nexit\r\n');
                            mesh.cmdchild.on('exit', function () { sendConsoleText("Run commands completed."); delete mesh.cmdchild; });
                        } else if (data.type == 2) {
                            // Windows Powershell
                            mesh.cmdchild = require('child_process').execFile(process.env['windir'] + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['powershell', '-noprofile', '-nologo', '-command', '-'], options);
                            mesh.cmdchild.descriptorMetadata = 'UserCommandsPowerShell';
                            mesh.cmdchild.stdout.on('data', function (c) { sendConsoleText(c.toString()); });
                            mesh.cmdchild.stderr.on('data', function (c) { sendConsoleText(c.toString()); });
                            mesh.cmdchild.stdin.write(data.cmds + '\r\nexit\r\n');
                            mesh.cmdchild.on('exit', function () { sendConsoleText("Run commands completed."); delete mesh.cmdchild; });
                        }
                    } else if (data.type == 3) {
                        // Linux shell
                        mesh.cmdchild = require('child_process').execFile('/bin/sh', ['sh'], options);
                        mesh.cmdchild.descriptorMetadata = 'UserCommandsShell';
                        mesh.cmdchild.stdout.on('data', function (c) { sendConsoleText(c.toString()); });
                        mesh.cmdchild.stderr.on('data', function (c) { sendConsoleText(c.toString()); });
                        mesh.cmdchild.stdin.write(data.cmds.split('\r').join('') + '\nexit\n');
                        mesh.cmdchild.on('exit', function () { sendConsoleText("Run commands completed."); delete mesh.cmdchild; });
                    }
                    break;
                }
                case 'uninstallagent':
                    // Uninstall this agent
                    var agentName = process.platform == 'win32' ? 'Mesh Agent' : 'meshagent';
                    if (require('service-manager').manager.getService(agentName).isMe()) {
                        try { diagnosticAgent_uninstall(); } catch (e) { }
                        var js = "require('service-manager').manager.getService('" + agentName + "').stop(); require('service-manager').manager.uninstallService('" + agentName + "'); process.exit();";
                        this.child = require('child_process').execFile(process.execPath, [process.platform == 'win32' ? (process.execPath.split('\\').pop()) : (process.execPath.split('/').pop()), '-b64exec', Buffer.from(js).toString('base64')], { type: 4, detached: true });
                    }
                    break;
                case 'poweraction': {
                    // Server telling us to execute a power action
                    if ((mesh.ExecPowerState != undefined) && (data.actiontype)) {
                        var forced = 0;
                        if (data.forced == 1) { forced = 1; }
                        data.actiontype = parseInt(data.actiontype);
                        MeshServerLogEx(25, [data.actiontype, forced], "Performing power action=" + data.actiontype + ", forced=" + forced, data);
                        sendConsoleText("Performing power action=" + data.actiontype + ", forced=" + forced + '.');
                        var r = mesh.ExecPowerState(data.actiontype, forced);
                        sendConsoleText("ExecPowerState returned code: " + r);
                    }
                    break;
                }
                case 'iplocation': {
                    // Update the IP location information of this node. Only do this when requested by the server since we have a limited amount of time we can call this per day
                    getIpLocationData(function (location) { mesh.SendCommand({ action: 'iplocation', type: 'publicip', value: location }); });
                    break;
                }
                case 'toast': {
                    // Display a toast message
                    if (data.title && data.msg) {
                        MeshServerLogEx(26, [data.title, data.msg], "Displaying toast message, title=" + data.title + ", message=" + data.msg, data);
                        data.msg = data.msg.split('\r').join('\\r').split('\n').join('\\n');
                        try { require('toaster').Toast(data.title, data.msg); } catch (e) { }
                    }
                    break;
                }
                case 'openUrl': {
                    // Open a local web browser and return success/fail
                    //sendConsoleText('OpenURL: ' + data.url);
                    MeshServerLogEx(20, [data.url], "Opening: " + data.url, data);
                    if (data.url) { mesh.SendCommand({ action: 'openUrl', url: data.url, sessionid: data.sessionid, success: (openUserDesktopUrl(data.url) != null) }); }
                    break;
                }
                case 'amtconfig': {
                    // Perform Intel AMT activation and/or configuration
                    if ((apftunnel != null) || (amt == null) || (typeof data.user != 'string') || (typeof data.pass != 'string')) break;
                    amt.getMeiState(15, function (state) {
                        if ((apftunnel != null) || (amt == null)) return;
                        if ((state == null) || (state.ProvisioningState == null)) return;
                        if ((state.UUID == null) || (state.UUID.length != 36)) return; // Bad UUID
                        var apfarg = {
                            mpsurl: mesh.ServerUrl.replace('/agent.ashx', '/apf.ashx'),
                            mpsuser: data.user, // Agent user name
                            mpspass: data.pass, // Encrypted login cookie
                            mpskeepalive: 60000,
                            clientname: state.OsHostname,
                            clientaddress: '127.0.0.1',
                            clientuuid: state.UUID,
                            conntype: 2, // 0 = CIRA, 1 = Relay, 2 = LMS. The correct value is 2 since we are performing an LMS relay, other values for testing.
                            meiState: state // MEI state will be passed to MPS server
                        };
                        addAmtEvent('LMS tunnel start.');
                        apftunnel = require('amt-apfclient')({ debug: false }, apfarg);
                        apftunnel.onJsonControl = function (data) {
                            if (data.action == 'console') { addAmtEvent(data.msg); } // Add console message to AMT event log
                            if (data.action == 'mestate') { amt.getMeiState(15, function (state) { apftunnel.updateMeiState(state); }); } // Update the MEI state
                            if (data.action == 'deactivate') { // Request CCM deactivation
                                var amtMeiModule, amtMei;
                                try { amtMeiModule = require('amt-mei'); amtMei = new amtMeiModule(); } catch (ex) { if (apftunnel) apftunnel.sendMeiDeactivationState(1); return; }
                                amtMei.on('error', function (e) { if (apftunnel) apftunnel.sendMeiDeactivationState(1); });
                                amtMei.unprovision(1, function (status) { if (apftunnel) apftunnel.sendMeiDeactivationState(status); }); // 0 = Success
                            }
                            if (data.action == 'close') { try { apftunnel.disconnect(); } catch (e) { } apftunnel = null; } // Close the CIRA-LMS connection
                        }
                        apftunnel.onChannelClosed = function () { addAmtEvent('LMS tunnel closed.'); apftunnel = null; }
                        try { apftunnel.connect(); } catch (ex) { }
                    });
                    break;
                }
                case 'getScript': {
                    // Received a configuration script from the server
                    sendConsoleText('getScript: ' + JSON.stringify(data));
                    break;
                }
                case 'sysinfo': {
                    // Fetch system information
                    getSystemInformation(function (results) {
                        if ((results != null) && (data.hash != results.hash)) { mesh.SendCommand({ action: 'sysinfo', sessionid: this.sessionid, data: results }); }
                    });
                    break;
                }
                case 'ping': { mesh.SendCommand('{"action":"pong"}'); break; }
                case 'pong': { break; }
                case 'plugin': {
                    try { require(data.plugin).consoleaction(data, data.rights, data.sessionid, this); } catch (e) { throw e; }
                    break;
                }
                case 'coredump':
                    // Set the current agent coredump situation.
                    if (data.value === true) {
                        if (process.platform == 'win32') {
                            // TODO: This replace() below is not ideal, would be better to remove the .exe at the end instead of replace.
                            process.coreDumpLocation = process.execPath.replace('.exe', '.dmp');
                        } else {
                            process.coreDumpLocation = (process.cwd() != '//') ? (process.cwd() + 'core') : null;
                        }
                    } else if (data.value === false) {
                        process.coreDumpLocation = null;
                    }
                    break;
                case 'getcoredump':
                    // Ask the agent if a core dump is currently available, if yes, also return the hash of the agent.
                    var r = { action: 'getcoredump', value: (process.coreDumpLocation != null) };
                    var coreDumpPath = null;
                    if (process.platform == 'win32') { coreDumpPath = process.coreDumpLocation; } else { coreDumpPath = (process.cwd() != '//') ? fs.existsSync(process.cwd() + 'core') : null; }
                    if ((coreDumpPath != null) && (fs.existsSync(coreDumpPath))) {
                        try {
                            var coredate = fs.statSync(coreDumpPath).mtime;
                            var coretime = new Date(coredate).getTime();
                            var agenttime = new Date(fs.statSync(process.execPath).mtime).getTime();
                            if (coretime > agenttime) { r.exists = (db.Get('CoreDumpTime') != coredate); }
                        } catch (ex) { }
                    }
                    if (r.exists == true) {
                        r.agenthashhex = getSHA384FileHash(process.execPath).toString('hex'); // Hash of current agent
                        r.corehashhex = getSHA384FileHash(coreDumpPath).toString('hex'); // Hash of core dump file
                    }
                    mesh.SendCommand(JSON.stringify(r));
                    break;
                case 'meshToolInfo':
                    if (data.pipe == true) { delete data.pipe; delete data.action; data.cmd = 'meshToolInfo'; broadcastToRegisteredApps(data); }
                    break;
                case 'wget': // Server uses this command to tell the agent to download a file using HTTPS/GET and place it in a given path. This is used for one-to-many file uploads.
                    agentFileHttpPendingRequests.push(data);
                    serverFetchFile();
                    break;
                default:
                    // Unknown action, ignore it.
                    break;
            }
        }
    }

    // Agent just get a file from the server and save it locally.
    function serverFetchFile() {
        if ((Object.keys(agentFileHttpRequests).length > 4) || (agentFileHttpPendingRequests.length == 0)) return; // No more than 4 active HTTPS requests to the server.
        var data = agentFileHttpPendingRequests.shift();
        if ((data.overwrite !== true) && fs.existsSync(data.path)) return; // Don't overwrite an existing file.
        if (data.createFolder) { try { fs.mkdirSync(data.folder); } catch (ex) { } } // If requested, create the local folder.
        data.url = 'http' + getServerTargetUrlEx('*/').substring(2);
        var agentFileHttpOptions = http.parseUri(data.url);
        agentFileHttpOptions.path = data.urlpath;

        // Perform manual server TLS certificate checking based on the certificate hash given by the server.
        agentFileHttpOptions.rejectUnauthorized = 0;
        agentFileHttpOptions.checkServerIdentity = function checkServerIdentity(certs) { if ((checkServerIdentity.servertlshash != null) && (checkServerIdentity.servertlshash != certs[0].digest.split(':').join('').toLowerCase())) { throw new Error('BadCert') } }
        agentFileHttpOptions.checkServerIdentity.servertlshash = data.servertlshash;

        if (agentFileHttpOptions == null) return;
        var agentFileHttpRequest = http.request(agentFileHttpOptions,
            function (response) {
                response.xparent = this;
                try {
                    response.xfile = fs.createWriteStream(this.xpath, { flags: 'wbN' })
                    response.pipe(response.xfile);
                    response.end = function () { delete agentFileHttpRequests[this.xparent.xurlpath]; delete this.xparent; serverFetchFile(); }
                } catch (ex) { delete agentFileHttpRequests[this.xurlpath]; delete response.xparent; serverFetchFile(); return; }
            }
        );
        agentFileHttpRequest.on('error', function (ex) { delete agentFileHttpRequests[this.xurlpath]; serverFetchFile(); });
        agentFileHttpRequest.end();
        agentFileHttpRequest.xurlpath = data.urlpath;
        agentFileHttpRequest.xpath = data.path;
        agentFileHttpRequests[data.urlpath] = agentFileHttpRequest;
    }

    // Called when a file changed in the file system
    /*
    function onFileWatcher(a, b) {
        console.log('onFileWatcher', a, b, this.path);
        var response = getDirectoryInfo(this.path);
        if ((response != undefined) && (response != null)) { this.tunnel.s.write(JSON.stringify(response)); }
    }
    */

    function getSystemInformation(func) {
        try {
            var results = { hardware: require('identifiers').get() }; // Hardware info
            if (results.hardware && results.hardware.windows) {
                // Remove extra entries and things that change quickly
                var x = results.hardware.windows.osinfo;
                try { delete x.FreePhysicalMemory; } catch (e) { }
                try { delete x.FreeSpaceInPagingFiles; } catch (e) { }
                try { delete x.FreeVirtualMemory; } catch (e) { }
                try { delete x.LocalDateTime; } catch (e) { }
                try { delete x.MaxProcessMemorySize; } catch (e) { }
                try { delete x.TotalVirtualMemorySize; } catch (e) { }
                try { delete x.TotalVisibleMemorySize; } catch (e) { }
                try {
                    if (results.hardware.windows.memory) { for (var i in results.hardware.windows.memory) { delete results.hardware.windows.memory[i].Node; } }
                    if (results.hardware.windows.osinfo) { delete results.hardware.windows.osinfo.Node; }
                    if (results.hardware.windows.partitions) { for (var i in results.hardware.windows.partitions) { delete results.hardware.windows.partitions[i].Node; } }
                } catch (e) { }
            }
            if (process.platform == 'win32') { results.pendingReboot = require('win-info').pendingReboot(); } // Pending reboot
            /*
            if (process.platform == 'win32') {
                var defragResult = function (r) {
                    if (typeof r == 'object') { results[this.callname] = r; }
                    if (this.callname == 'defrag') {
                        var pr = require('win-info').installedApps(); // Installed apps
                        pr.callname = 'installedApps';
                        pr.sessionid = data.sessionid;
                        pr.then(defragResult, defragResult);
                    }
                    else {
                        results.winpatches = require('win-info').qfe(); // Windows patches
                        results.hash = require('SHA384Stream').create().syncHash(JSON.stringify(results)).toString('hex');
                        func(results);
                    }
                }
                var pr = require('win-info').defrag({ volume: 'C:' }); // Defrag TODO
                pr.callname = 'defrag';
                pr.sessionid = data.sessionid;
                pr.then(defragResult, defragResult);
            } else {
            */
            results.hash = require('SHA384Stream').create().syncHash(JSON.stringify(results)).toString('hex');
            func(results);
            //}
        } catch (e) { func(null, e); }
    }

    // Get a formated response for a given directory path
    function getDirectoryInfo(reqpath) {
        var response = { path: reqpath, dir: [] };
        if (((reqpath == undefined) || (reqpath == '')) && (process.platform == 'win32')) {
            // List all the drives in the root, or the root itself
            var results = null;
            try { results = fs.readDrivesSync(); } catch (e) { } // TODO: Anyway to get drive total size and free space? Could draw a progress bar.
            if (results != null) {
                for (var i = 0; i < results.length; ++i) {
                    var drive = { n: results[i].name, t: 1 };
                    if (results[i].type == 'REMOVABLE') { drive.dt = 'removable'; } // TODO: See if this is USB/CDROM or something else, we can draw icons.
                    response.dir.push(drive);
                }
            }
        } else {
            // List all the files and folders in this path
            if (reqpath == '') { reqpath = '/'; }
            var results = null, xpath = obj.path.join(reqpath, '*');
            //if (process.platform == "win32") { xpath = xpath.split('/').join('\\'); }
            try { results = fs.readdirSync(xpath); } catch (e) { }
            if (results != null) {
                for (var i = 0; i < results.length; ++i) {
                    if ((results[i] != '.') && (results[i] != '..')) {
                        var stat = null, p = obj.path.join(reqpath, results[i]);
                        //if (process.platform == "win32") { p = p.split('/').join('\\'); }
                        try { stat = fs.statSync(p); } catch (e) { } // TODO: Get file size/date
                        if ((stat != null) && (stat != undefined)) {
                            if (stat.isDirectory() == true) {
                                response.dir.push({ n: results[i], t: 2, d: stat.mtime });
                            } else {
                                response.dir.push({ n: results[i], t: 3, s: stat.size, d: stat.mtime });
                            }
                        }
                    }
                }
            }
        }
        return response;
    }

    // Tunnel callback operations
    function onTunnelUpgrade(response, s, head) {
        this.s = s;
        s.httprequest = this;
        s.end = onTunnelClosed;
        s.tunnel = this;
        s.descriptorMetadata = "MeshAgent_relayTunnel";

        if (require('MeshAgent').idleTimeout != null)
        {
            s.setTimeout(require('MeshAgent').idleTimeout * 1000);
            s.on('timeout', function ()
            {
                this.ping();
                this.setTimeout(require('MeshAgent').idleTimeout * 1000);
            });
        }

        //sendConsoleText('onTunnelUpgrade - ' + this.tcpport + ' - ' + this.udpport);

        if (this.tcpport != null) {
            // This is a TCP relay connection, pause now and try to connect to the target.
            s.pause();
            s.data = onTcpRelayServerTunnelData;
            var connectionOptions = { port: parseInt(this.tcpport) };
            if (this.tcpaddr != null) { connectionOptions.host = this.tcpaddr; } else { connectionOptions.host = '127.0.0.1'; }
            s.tcprelay = net.createConnection(connectionOptions, onTcpRelayTargetTunnelConnect);
            s.tcprelay.peerindex = this.index;

            // Add the TCP session to the count and update the server
            if (s.httprequest.userid != null) {
                if (tunnelUserCount.tcp[s.httprequest.userid] == null) { tunnelUserCount.tcp[s.httprequest.userid] = 1; } else { tunnelUserCount.tcp[s.httprequest.userid]++; }
                try { mesh.SendCommand({ action: 'sessions', type: 'tcp', value: tunnelUserCount.tcp }); } catch (e) { }
                broadcastSessionsToRegisteredApps();
            }
        } if (this.udpport != null) {
            // This is a UDP relay connection, get the UDP socket setup. // TODO: ***************
            s.data = onUdpRelayServerTunnelData;
            s.udprelay = require('dgram').createSocket({ type: 'udp4' });
            s.udprelay.bind({ port: 0 });
            s.udprelay.peerindex = this.index;
            s.udprelay.on('message', onUdpRelayTargetTunnelConnect);
            s.udprelay.udpport = this.udpport;
            s.udprelay.udpaddr = this.udpaddr;
            s.udprelay.first = true;

            // Add the UDP session to the count and update the server
            if (s.httprequest.userid != null) {
                if (tunnelUserCount.udp[s.httprequest.userid] == null) { tunnelUserCount.udp[s.httprequest.userid] = 1; } else { tunnelUserCount.udp[s.httprequest.userid]++; }
                try { mesh.SendCommand({ action: 'sessions', type: 'udp', value: tunnelUserCount.tcp }); } catch (e) { }
                broadcastSessionsToRegisteredApps();
            }
        } else {
            // This is a normal connect for KVM/Terminal/Files
            s.data = onTunnelData;
        }
    }

    // Called when UDP relay data is received // TODO****
    function onUdpRelayTargetTunnelConnect(data) {
        var peerTunnel = tunnels[this.peerindex];
        peerTunnel.s.write(data);
    }

    // Called when we get data from the server for a TCP relay (We have to skip the first received 'c' and pipe the rest)
    function onUdpRelayServerTunnelData(data) {
        if (this.udprelay.first === true) {
            delete this.udprelay.first; // Skip the first 'c' that is received.
        } else {
            this.udprelay.send(data, parseInt(this.udprelay.udpport), this.udprelay.udpaddr ? this.udprelay.udpaddr : '127.0.0.1');
        }
    }

    // Called when the TCP relay target is connected
    function onTcpRelayTargetTunnelConnect() {
        var peerTunnel = tunnels[this.peerindex];
        this.pipe(peerTunnel.s); // Pipe Target --> Server
        peerTunnel.s.first = true;
        peerTunnel.s.resume();
    }

    // Called when we get data from the server for a TCP relay (We have to skip the first received 'c' and pipe the rest)
    function onTcpRelayServerTunnelData(data) {
        if (this.first == true) {
            this.first = false; 
            this.pipe(this.tcprelay, { dataTypeSkip: 1 }); // Pipe Server --> Target (don't pipe text type websocket frames)
        }
    }

    function onTunnelClosed() {
        var tunnel = tunnels[this.httprequest.index];
        if (tunnel == null) return; // Stop duplicate calls.

        // If this is a routing session, clean up and send the new session counts.
        if (this.httprequest.userid != null) {
            if (this.httprequest.tcpport != null) {
                if (tunnelUserCount.tcp[this.httprequest.userid] != null) { tunnelUserCount.tcp[this.httprequest.userid]--; if (tunnelUserCount.tcp[this.httprequest.userid] <= 0) { delete tunnelUserCount.tcp[this.httprequest.userid]; } }
                try { mesh.SendCommand({ action: 'sessions', type: 'tcp', value: tunnelUserCount.tcp }); } catch (e) { }
                broadcastSessionsToRegisteredApps();
            } else if (this.httprequest.udpport != null) {
                if (tunnelUserCount.udp[this.httprequest.userid] != null) { tunnelUserCount.udp[this.httprequest.userid]--; if (tunnelUserCount.udp[this.httprequest.userid] <= 0) { delete tunnelUserCount.udp[this.httprequest.userid]; } }
                try { mesh.SendCommand({ action: 'sessions', type: 'udp', value: tunnelUserCount.udp }); } catch (e) { }
                broadcastSessionsToRegisteredApps();
            }
        }

        // Sent tunnel statistics to the server, only send this if compression was used.
        if ((this.bytesSent_uncompressed) && (this.bytesSent_uncompressed.toString() != this.bytesSent_actual.toString())) {
            mesh.SendCommand({
                action: 'tunnelCloseStats',
                url: tunnel.url,
                userid: tunnel.userid,
                protocol: tunnel.protocol,
                sessionid: tunnel.sessionid,
                sent: this.bytesSent_uncompressed.toString(),
                sentActual: this.bytesSent_actual.toString(),
                sentRatio: this.bytesSent_ratio,
                received: this.bytesReceived_uncompressed.toString(),
                receivedActual: this.bytesReceived_actual.toString(),
                receivedRatio: this.bytesReceived_ratio
            });
        }

        //sendConsoleText("Tunnel #" + this.httprequest.index + " closed. Sent -> " + this.bytesSent_uncompressed + ' bytes (uncompressed), ' + this.bytesSent_actual + ' bytes (actual), ' + this.bytesSent_ratio + '% compression', this.httprequest.sessionid);
        if (this.httprequest.index) { delete tunnels[this.httprequest.index]; }

        /*
        // Close the watcher if required
        if (this.httprequest.watcher != undefined) {
            //console.log('Closing watcher: ' + this.httprequest.watcher.path);
            //this.httprequest.watcher.close(); // TODO: This line causes the agent to crash!!!!
            delete this.httprequest.watcher;
        }
        */

        // If there is a upload or download active on this connection, close the file
        if (this.httprequest.uploadFile) { fs.closeSync(this.httprequest.uploadFile); delete this.httprequest.uploadFile; delete this.httprequest.uploadFileid; delete this.httprequest.uploadFilePath; }
        if (this.httprequest.downloadFile) { delete this.httprequest.downloadFile; }

        // Clean up WebRTC
        if (this.webrtc != null) {
            if (this.webrtc.rtcchannel) { try { this.webrtc.rtcchannel.close(); } catch (e) { } this.webrtc.rtcchannel.removeAllListeners('data'); this.webrtc.rtcchannel.removeAllListeners('end'); delete this.webrtc.rtcchannel; }
            if (this.webrtc.websocket) { delete this.webrtc.websocket; }
            try { this.webrtc.close(); } catch (e) { }
            this.webrtc.removeAllListeners('connected');
            this.webrtc.removeAllListeners('disconnected');
            this.webrtc.removeAllListeners('dataChannel');
            delete this.webrtc;
        }

        // Clean up WebSocket
        this.removeAllListeners('data');
    }
    function onTunnelSendOk() { /*sendConsoleText("Tunnel #" + this.index + " SendOK.", this.sessionid);*/ }
    function onTunnelData(data) {
        //console.log("OnTunnelData");
        //sendConsoleText('OnTunnelData, ' + data.length + ', ' + typeof data + ', ' + data);

        // If this is upload data, save it to file
        if ((this.httprequest.uploadFile) && (typeof data == 'object') && (data[0] != 123)) {
            // Save the data to file being uploaded.
            if (data[0] == 0) {
                // If data starts with zero, skip the first byte. This is used to escape binary file data from JSON.
                try { fs.writeSync(this.httprequest.uploadFile, data, 1, data.length - 1); } catch (e) { sendConsoleText('FileUpload Error'); this.write(Buffer.from(JSON.stringify({ action: 'uploaderror' }))); return; } // Write to the file, if there is a problem, error out.
            } else {
                // If data does not start with zero, save as-is.
                try { fs.writeSync(this.httprequest.uploadFile, data); } catch (e) { sendConsoleText('FileUpload Error'); this.write(Buffer.from(JSON.stringify({ action: 'uploaderror' }))); return; } // Write to the file, if there is a problem, error out.
            }
            this.write(Buffer.from(JSON.stringify({ action: 'uploadack', reqid: this.httprequest.uploadFileid }))); // Ask for more data.
            return;
        }

        if (this.httprequest.state == 0) {
            // Check if this is a relay connection
            if ((data == 'c') || (data == 'cr')) { this.httprequest.state = 1; /*sendConsoleText("Tunnel #" + this.httprequest.index + " now active", this.httprequest.sessionid);*/ }
        }
        else
        {
            // Handle tunnel data
            if (this.httprequest.protocol == 0) { // 1 = Terminal (admin), 2 = Desktop, 5 = Files, 6 = PowerShell (admin), 7 = Plugin Data Exchange, 8 = Terminal (user), 9 = PowerShell (user), 10 = FileTransfer
                // Take a look at the protocol
                if ((data.length > 3) && (data[0] == '{')) { onTunnelControlData(data, this); return; }
                this.httprequest.protocol = parseInt(data);
                if (typeof this.httprequest.protocol != 'number') { this.httprequest.protocol = 0; }
                if (this.httprequest.protocol == 10) {
                    //
                    // Basic file transfer
                    //
                    var stats = null;
                    if ((process.platform != 'win32') && (this.httprequest.xoptions.file.startsWith('/') == false)) { this.httprequest.xoptions.file = '/' + this.httprequest.xoptions.file; }
                    try { stats = require('fs').statSync(this.httprequest.xoptions.file) } catch (e) { }
                    try { if (stats) { this.httprequest.downloadFile = fs.createReadStream(this.httprequest.xoptions.file, { flags: 'rbN' }); } } catch (e) { }
                    if (this.httprequest.downloadFile) {
                        //sendConsoleText('BasicFileTransfer, ok, ' + this.httprequest.xoptions.file + ', ' + JSON.stringify(stats));
                        this.write(JSON.stringify({ op: 'ok', size: stats.size }));
                        this.httprequest.downloadFile.pipe(this);
                        this.httprequest.downloadFile.end = function () { }
                    } else {
                        //sendConsoleText('BasicFileTransfer, cancel, ' + this.httprequest.xoptions.file);
                        this.write(JSON.stringify({ op: 'cancel' }));
                    }
                }
                else if ((this.httprequest.protocol == 1) || (this.httprequest.protocol == 6) || (this.httprequest.protocol == 8) || (this.httprequest.protocol == 9))
                {
                    //
                    // Remote Terminal
                    //

                    // Check user access rights for terminal
                    if (((this.httprequest.rights & MESHRIGHT_REMOTECONTROL) == 0) || ((this.httprequest.rights != 0xFFFFFFFF) && ((this.httprequest.rights & MESHRIGHT_NOTERMINAL) != 0))) {
                        // Disengage this tunnel, user does not have the rights to do this!!
                        this.httprequest.protocol = 999999;
                        this.httprequest.s.end();
                        sendConsoleText("Error: No Terminal Control Rights.");
                        return;
                    }

                    this.descriptorMetadata = "Remote Terminal";

                    if (process.platform == 'win32')
                    {
                        if (!require('win-terminal').PowerShellCapable() && (this.httprequest.protocol == 6 || this.httprequest.protocol == 9))
                        {
                            this.httprequest.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: 'PowerShell is not supported on this version of windows', msgid: 1 }));
                            this.httprequest.s.end();
                            return;
                        }
                    }

                    var prom = require('promise');
                    this.httprequest.tpromise = new prom(function (res, rej) { this._res = res; this._rej = rej; });
                    this.httprequest.tpromise.that = this;
                    this.httprequest.tpromise.httprequest = this.httprequest;

                    this.end = function ()
                    {
                        if (this.httprequest.tpromise._consent) { this.httprequest.tpromise._consent.close(); }
                        if (this.httprequest.connectionPromise) { this.httprequest.connectionPromise._rej('Closed'); }

                        // Remove the terminal session to the count to update the server
                        if (this.httprequest.userid != null)
                        {
                            if (tunnelUserCount.terminal[this.httprequest.userid] != null) { tunnelUserCount.terminal[this.httprequest.userid]--; if (tunnelUserCount.terminal[this.httprequest.userid] <= 0) { delete tunnelUserCount.terminal[this.httprequest.userid]; } }
                            try { mesh.SendCommand({ action: 'sessions', type: 'terminal', value: tunnelUserCount.terminal }); } catch (e) { }
                            broadcastSessionsToRegisteredApps();
                        }

                        if (process.platform == 'win32')
                        {
                            // Unpipe the web socket
                            this.unpipe(this.httprequest._term);
                            if (this.httprequest._term) { this.httprequest._term.unpipe(this); }

                            // Unpipe the WebRTC channel if needed (This will also be done when the WebRTC channel ends).
                            if (this.rtcchannel)
                            {
                                this.rtcchannel.unpipe(this.httprequest._term);
                                if (this.httprequest._term) { this.httprequest._term.unpipe(this.rtcchannel); }
                            }

                            // Clean up
                            if (this.httprequest._term) { this.httprequest._term.end(); }
                            this.httprequest._term = null;
                        }
                    };

                    // Perform User-Consent if needed. 
                    if (this.httprequest.consent && (this.httprequest.consent & 16))
                    {
                        this.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: "Waiting for user to grant access...", msgid: 1 }));
                        var consentMessage = this.httprequest.username + " requesting remote terminal access. Grant access?", consentTitle = 'MeshCentral';
                        if (this.httprequest.soptions != null) {
                            if (this.httprequest.soptions.consentTitle != null) { consentTitle = this.httprequest.soptions.consentTitle; }
                            if (this.httprequest.soptions.consentMsgTerminal != null) { consentMessage = this.httprequest.soptions.consentMsgTerminal.replace('{0}', this.httprequest.realname).replace('{1}', this.httprequest.username); }
                        }
                        this.httprequest.tpromise._consent = require('message-box').create(consentTitle, consentMessage, 30);
                        this.httprequest.tpromise._consent.retPromise = this.httprequest.tpromise;
                        this.httprequest.tpromise._consent.then(
                            function ()
                            {
                                // Success
                                MeshServerLogEx(27, null, "Local user accepted remote terminal request (" + this.retPromise.httprequest.remoteaddr + ")", this.retPromise.that.httprequest);
                                this.retPromise.that.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: null, msgid: 0 }));
                                this.retPromise._consent = null;
                                this.retPromise._res();
                            },
                            function (e)
                            {
                                // Denied
                                MeshServerLogEx(28, null, "Local user rejected remote terminal request (" + this.retPromise.that.httprequest.remoteaddr + ")", this.retPromise.that.httprequest);
                                this.retPromise.that.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: e.toString(), msgid: 2 }));
                                this.retPromise._rej(e.toString());
                            });
                    }
                    else
                    {
                        // User-Consent is not required, so just resolve this promise
                        this.httprequest.tpromise._res();
                    }


                    this.httprequest.tpromise.then(
                        function ()
                        {
                            this.httprequest.connectionPromise = new prom(function (res, rej) { this._res = res; this._rej = rej; });
                            this.httprequest.connectionPromise.ws = this.that;

                            // Start Terminal
                            if(process.platform == 'win32')
                            {
                                try
                                {
                                    var cols = 80, rows = 25;
                                    if (this.httprequest.xoptions)
                                    {
                                        if (this.httprequest.xoptions.rows) { rows = this.httprequest.xoptions.rows; }
                                        if (this.httprequest.xoptions.cols) { cols = this.httprequest.xoptions.cols; }
                                    }

                                    if ((this.httprequest.protocol == 1) || (this.httprequest.protocol == 6))
                                    {
                                        // Admin Terminal
                                        if (require('win-virtual-terminal').supported)
                                        {
                                            // ConPTY PseudoTerminal
                                            // this.httprequest._term = require('win-virtual-terminal')[this.httprequest.protocol == 6 ? 'StartPowerShell' : 'Start'](80, 25);

                                            // The above line is commented out, because there is a bug with ClosePseudoConsole() API, so this is the workaround
                                            this.httprequest._dispatcher = require('win-dispatcher').dispatch({ modules: [{ name: 'win-virtual-terminal', script: getJSModule('win-virtual-terminal') }], launch: { module: 'win-virtual-terminal', method: (this.httprequest.protocol == 6 ? 'StartPowerShell' : 'Start'), args: [cols, rows] } });
                                            this.httprequest._dispatcher.httprequest = this.httprequest;
                                            this.httprequest._dispatcher.on('connection', function (c)
                                            {
                                                if (this.httprequest.connectionPromise.completed)
                                                {
                                                    c.end();
                                                }
                                                else
                                                {
                                                    this.httprequest.connectionPromise._res(c);
                                                }
                                            });
                                        }
                                        else
                                        {
                                            // Legacy Terminal
                                            this.httprequest.connectionPromise._res(require('win-terminal')[this.httprequest.protocol == 6 ? 'StartPowerShell' : 'Start'](cols, rows));
                                        }
                                    }
                                    else
                                    {
                                        // Logged in user
                                        var userPromise = require('user-sessions').enumerateUsers();
                                        userPromise.that = this;
                                        userPromise.then(function (u)
                                        {
                                            var that = this.that;
                                            if (u.Active.length > 0)
                                            {
                                                var username = u.Active[0].Username;
                                                if (require('win-virtual-terminal').supported)
                                                {
                                                    // ConPTY PseudoTerminal
                                                    that.httprequest._dispatcher = require('win-dispatcher').dispatch({ user: username, modules: [{ name: 'win-virtual-terminal', script: getJSModule('win-virtual-terminal') }], launch: { module: 'win-virtual-terminal', method: (that.httprequest.protocol == 9 ? 'StartPowerShell' : 'Start'), args: [cols, rows] } });
                                                }
                                                else
                                                {
                                                    // Legacy Terminal
                                                    that.httprequest._dispatcher = require('win-dispatcher').dispatch({ user: username, modules: [{ name: 'win-terminal', script: getJSModule('win-terminal') }], launch: { module: 'win-terminal', method: (that.httprequest.protocol == 9 ? 'StartPowerShell' : 'Start'), args: [cols, rows] } });
                                                }
                                                that.httprequest._dispatcher.ws = that;
                                                that.httprequest._dispatcher.on('connection', function (c)
                                                {
                                                    if (this.ws.httprequest.connectionPromise.completed)
                                                    {
                                                        c.end();
                                                    }
                                                    else
                                                    {
                                                        this.ws.httprequest.connectionPromise._res(c);
                                                    }
                                                });
                                            }
                                        });
                                    }
                                }
                                catch (e)
                                {
                                    this.httprequest.connectionPromise._rej('Failed to start remote terminal session, ' + e.toString());
                                }
                            }
                            else
                            {
                                try
                                {
                                    var bash = fs.existsSync('/bin/bash') ? '/bin/bash' : false;
                                    var sh = fs.existsSync('/bin/sh') ? '/bin/sh' : false;
                                    var login = process.platform == 'linux' ? '/bin/login' : '/usr/bin/login';

                                    var env = { HISTCONTROL: 'ignoreboth' };
                                    if (this.httprequest.xoptions)
                                    {
                                        if (this.httprequest.xoptions.rows) { env.LINES = ('' + this.httprequest.xoptions.rows); }
                                        if (this.httprequest.xoptions.cols) { env.COLUMNS = ('' + this.httprequest.xoptions.cols); }
                                    }
                                    var options = { type: childProcess.SpawnTypes.TERM, uid: (this.httprequest.protocol == 8) ? require('user-sessions').consoleUid() : null, env: env };
                                    if (this.httprequest.xoptions && this.httprequest.xoptions.requireLogin)
                                    {
                                        if (!require('fs').existsSync(login)) { throw ('Unable to spawn login process'); }
                                        this.httprequest.connectionPromise._res(childProcess.execFile(login, ['login'], options)); // Start login shell
                                    }
                                    else if (bash)
                                    {
                                        var p = childProcess.execFile(bash, ['bash'], options); // Start bash
                                        // Spaces at the beginning of lines are needed to hide commands from the command history
                                        if (process.platform == 'linux') { p.stdin.write(' alias ls=\'ls --color=auto\';clear\n'); }
                                        this.httprequest.connectionPromise._res(p);
                                    }
                                    else if (sh)
                                    {
                                        var p = childProcess.execFile(sh, ['sh'], options); // Start sh
                                        // Spaces at the beginning of lines are needed to hide commands from the command history
                                        if (process.platform == 'linux') { p.stdin.write(' alias ls=\'ls --color=auto\';clear\n'); }
                                        this.httprequest.connectionPromise._res(p);
                                    }
                                    else
                                    {
                                        this.httprequest.connectionPromise._rej('Failed to start remote terminal session, no shell found');
                                    }
                                }
                                catch (e)
                                {
                                    this.httprequest.connectionPromise._rej('Failed to start remote terminal session, ' + e.toString());
                                }
                            }

                            this.httprequest.connectionPromise.then(
                                function (term)
                                {
                                    // SUCCESS
                                    var stdoutstream;
                                    var stdinstream;
                                    if (process.platform == 'win32')
                                    {
                                        this.ws.httprequest._term = term;
                                        this.ws.httprequest._term.tunnel = this.ws;
                                        stdoutstream = stdinstream = term;
                                    }
                                    else
                                    {
                                        term.descriptorMetadata = 'Remote Terminal';
                                        this.ws.httprequest.process = term;
                                        this.ws.httprequest.process.tunnel = this.ws;
                                        term.stderr.stdout = term.stdout;
                                        term.stderr.on('data', function (c) { this.stdout.write(c); });
                                        stdoutstream = term.stdout;
                                        stdinstream = term.stdin;
                                        this.ws.prependListener('end', function () { this.httprequest.process.kill(); });
                                        term.prependListener('exit', function () { this.tunnel.end(); });
                                    }

                                    this.ws.removeAllListeners('data');
                                    this.ws.on('data', onTunnelControlData);

                                    stdoutstream.pipe(this.ws, { dataTypeSkip: 1 });            // 0 = Binary, 1 = Text.
                                    this.ws.pipe(stdinstream, { dataTypeSkip: 1, end: false }); // 0 = Binary, 1 = Text. 

                                    // Add the terminal session to the count to update the server
                                    if (this.ws.httprequest.userid != null)
                                    {
                                        if (tunnelUserCount.terminal[this.ws.httprequest.userid] == null) { tunnelUserCount.terminal[this.ws.httprequest.userid] = 1; } else { tunnelUserCount.terminal[this.ws.httprequest.userid]++; }
                                        try { mesh.SendCommand({ action: 'sessions', type: 'terminal', value: tunnelUserCount.terminal }); } catch (e) { }
                                        broadcastSessionsToRegisteredApps();
                                    }

                                    // Toast Notification, if required
                                    if (this.ws.httprequest.consent && (this.ws.httprequest.consent & 2))
                                    {
                                        // User Notifications is required
                                        var notifyMessage = this.ws.httprequest.username + " started a remote terminal session.", notifyTitle = "MeshCentral";
                                        if (this.ws.httprequest.soptions != null) {
                                            if (this.ws.httprequest.soptions.notifyTitle != null) { notifyTitle = this.ws.httprequest.soptions.notifyTitle; }
                                            if (this.ws.httprequest.soptions.notifyMsgTerminal != null) { notifyMessage = this.ws.httprequest.soptions.notifyMsgTerminal.replace('{0}', this.ws.httprequest.realname).replace('{1}', this.ws.httprequest.username); }
                                        }
                                        try { require('toaster').Toast(notifyTitle, notifyMessage); } catch (e) { }
                                    }
                                },
                                function (e)
                                {
                                    // FAILED to connect terminal
                                    this.ws.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: e.toString(), msgid: 2 }));
                                    this.ws.end();
                                });
                        },
                        function (e)
                        {
                            // DO NOT start terminal
                            this.that.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: e.toString(), msgid: 2 }));
                            this.that.end();
                        });          
                }
                else if (this.httprequest.protocol == 2)
                {
                    //
                    // Remote KVM
                    //

                    // Check user access rights for desktop
                    if ((((this.httprequest.rights & MESHRIGHT_REMOTECONTROL) == 0) && ((this.httprequest.rights & MESHRIGHT_REMOTEVIEW) == 0)) || ((this.httprequest.rights != 0xFFFFFFFF) && ((this.httprequest.rights & MESHRIGHT_NODESKTOP) != 0))) {
                        // Disengage this tunnel, user does not have the rights to do this!!
                        this.httprequest.protocol = 999999;
                        this.httprequest.s.end();
                        sendConsoleText("Error: No Desktop Control Rights.");
                        return;
                    }

                    this.descriptorMetadata = "Remote KVM";

                    // Look for a TSID
                    var tsid = null;
                    if ((this.httprequest.xoptions != null) && (typeof this.httprequest.xoptions.tsid == 'number')) { tsid = this.httprequest.xoptions.tsid; }
                    require('MeshAgent')._tsid = tsid;

                    // Remote desktop using native pipes
                    this.httprequest.desktop = { state: 0, kvm: mesh.getRemoteDesktopStream(tsid), tunnel: this };
                    this.httprequest.desktop.kvm.parent = this.httprequest.desktop;
                    this.desktop = this.httprequest.desktop;

                    // Add ourself to the list of remote desktop sessions
                    if (this.httprequest.desktop.kvm.tunnels == null) { this.httprequest.desktop.kvm.tunnels = []; }
                    this.httprequest.desktop.kvm.tunnels.push(this);

                    // Send a metadata update to all desktop sessions
                    var users = {};
                    if (this.httprequest.desktop.kvm.tunnels != null) {
                        for (var i in this.httprequest.desktop.kvm.tunnels) { try { var userid = this.httprequest.desktop.kvm.tunnels[i].httprequest.userid; if (users[userid] == null) { users[userid] = 1; } else { users[userid]++; } } catch (e) { } }
                        for (var i in this.httprequest.desktop.kvm.tunnels) { try { this.httprequest.desktop.kvm.tunnels[i].write(JSON.stringify({ ctrlChannel: '102938', type: 'metadata', users: users })); } catch (e) { } }
                        tunnelUserCount.desktop = users;
                        try { mesh.SendCommand({ action: 'sessions', type: 'kvm', value: users }); } catch (e) { }
                        broadcastSessionsToRegisteredApps();
                    }

                    this.end = function () {
                        --this.desktop.kvm.connectionCount;

                        // Remove ourself from the list of remote desktop session
                        var i = this.desktop.kvm.tunnels.indexOf(this);
                        if (i >= 0) { this.desktop.kvm.tunnels.splice(i, 1); }

                        // Send a metadata update to all desktop sessions
                        var users = {};
                        if (this.httprequest.desktop.kvm.tunnels != null) {
                            for (var i in this.httprequest.desktop.kvm.tunnels) { try { var userid = this.httprequest.desktop.kvm.tunnels[i].httprequest.userid; if (users[userid] == null) { users[userid] = 1; } else { users[userid]++; } } catch (e) { } }
                            for (var i in this.httprequest.desktop.kvm.tunnels) { try { this.httprequest.desktop.kvm.tunnels[i].write(JSON.stringify({ ctrlChannel: '102938', type: 'metadata', users: users })); } catch (e) { } }
                            tunnelUserCount.desktop = users;
                            try { mesh.SendCommand({ action: 'sessions', type: 'kvm', value: users }); } catch (e) { }
                            broadcastSessionsToRegisteredApps();
                        }

                        // Unpipe the web socket
                        try
                        {
                            this.unpipe(this.httprequest.desktop.kvm);
                            this.httprequest.desktop.kvm.unpipe(this);
                        }
                        catch(e) { }

                        // Unpipe the WebRTC channel if needed (This will also be done when the WebRTC channel ends).
                        if (this.rtcchannel)
                        {
                            try
                            {
                                this.rtcchannel.unpipe(this.httprequest.desktop.kvm);
                                this.httprequest.desktop.kvm.unpipe(this.rtcchannel);
                            }
                            catch(e) { }
                        }

                        // Place wallpaper back if needed
                        // TODO

                        if (this.desktop.kvm.connectionCount == 0) {
                            // Display a toast message. This may not be supported on all platforms.
                            // try { require('toaster').Toast('MeshCentral', 'Remote Desktop Control Ended.'); } catch (e) { }

                            this.httprequest.desktop.kvm.end();
                            if (this.httprequest.desktop.kvm.connectionBar) {
                                this.httprequest.desktop.kvm.connectionBar.removeAllListeners('close');
                                this.httprequest.desktop.kvm.connectionBar.close();
                                this.httprequest.desktop.kvm.connectionBar = null;
                            }
                        } else {
                            for (var i in this.httprequest.desktop.kvm.users) {
                                if ((this.httprequest.desktop.kvm.users[i] == this.httprequest.username) && this.httprequest.desktop.kvm.connectionBar) {
                                    for (var j in this.httprequest.desktop.kvm.rusers) { if (this.httprequest.desktop.kvm.rusers[j] == this.httprequest.realname) { this.httprequest.desktop.kvm.rusers.splice(j, 1); break; } }
                                    this.httprequest.desktop.kvm.users.splice(i, 1);
                                    this.httprequest.desktop.kvm.connectionBar.removeAllListeners('close');
                                    this.httprequest.desktop.kvm.connectionBar.close();
                                    this.httprequest.desktop.kvm.connectionBar = require('notifybar-desktop')(this.httprequest.privacybartext.replace('{0}', this.httprequest.desktop.kvm.users.join(', ')).replace('{1}', this.httprequest.desktop.kvm.rusers.join(', ')), require('MeshAgent')._tsid);
                                    this.httprequest.desktop.kvm.connectionBar.httprequest = this.httprequest;
                                    this.httprequest.desktop.kvm.connectionBar.on('close', function () {
                                        MeshServerLogEx(29, null, "Remote Desktop Connection forcefully closed by local user (" + this.httprequest.remoteaddr + ")", this.httprequest);
                                        for (var i in this.httprequest.desktop.kvm._pipedStreams) {
                                            this.httprequest.desktop.kvm._pipedStreams[i].end();
                                        }
                                        this.httprequest.desktop.kvm.end();
                                    });
                                    break;
                                }
                            }
                        }
                    };
                    if (this.httprequest.desktop.kvm.hasOwnProperty('connectionCount')) {
                        this.httprequest.desktop.kvm.connectionCount++;
                        this.httprequest.desktop.kvm.rusers.push(this.httprequest.realname);
                        this.httprequest.desktop.kvm.users.push(this.httprequest.username);
                        this.httprequest.desktop.kvm.rusers.sort();
                        this.httprequest.desktop.kvm.users.sort();
                    } else {
                        this.httprequest.desktop.kvm.connectionCount = 1;
                        this.httprequest.desktop.kvm.rusers = [this.httprequest.realname];
                        this.httprequest.desktop.kvm.users = [this.httprequest.username];
                    }

                    if ((this.httprequest.rights == 0xFFFFFFFF) || (((this.httprequest.rights & MESHRIGHT_REMOTECONTROL) != 0) && ((this.httprequest.rights & MESHRIGHT_REMOTEVIEW) == 0))) {
                        // If we have remote control rights, pipe the KVM input
                        this.pipe(this.httprequest.desktop.kvm, { dataTypeSkip: 1, end: false }); // 0 = Binary, 1 = Text. Pipe the Browser --> KVM input.
                    } else {
                        // We need to only pipe non-mouse & non-keyboard inputs.
                        //sendConsoleText('Warning: No Remote Desktop Input Rights.');
                        // TODO!!!
                    }

                    // Perform notification if needed. Toast messages may not be supported on all platforms.
                    if (this.httprequest.consent && (this.httprequest.consent & 8))
                    {
                        // User Consent Prompt is required
                        // Send a console message back using the console channel, "\n" is supported.
                        this.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: "Waiting for user to grant access...", msgid: 1 }));
                        var consentMessage = this.httprequest.realname + " requesting remote desktop access. Grant access?", consentTitle = 'MeshCentral';
                        if (this.httprequest.soptions != null) {
                            if (this.httprequest.soptions.consentTitle != null) { consentTitle = this.httprequest.soptions.consentTitle; }
                            if (this.httprequest.soptions.consentMsgDesktop != null) { consentMessage = this.httprequest.soptions.consentMsgDesktop.replace('{0}', this.httprequest.realname).replace('{1}', this.httprequest.username); }
                        }
                        var pr = require('message-box').create(consentTitle, consentMessage, 30, null, tsid);
                        pr.ws = this;
                        this.pause();
                        this._consentpromise = pr;
                        this.prependOnceListener('end', function () { if (this._consentpromise && this._consentpromise.close) { this._consentpromise.close(); }});
                        pr.then(
                            function ()
                            {
                                // Success
                                this.ws._consentpromise = null;
                                MeshServerLogEx(30, null, "Starting remote desktop after local user accepted (" + this.ws.httprequest.remoteaddr + ")", this.ws.httprequest);
                                this.ws.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: null, msgid: 0 }));
                                if (this.ws.httprequest.consent && (this.ws.httprequest.consent & 1)) {
                                    // User Notifications is required
                                    var notifyMessage = this.ws.httprequest.realname + " started a remote desktop session.", notifyTitle = "MeshCentral";
                                    if (this.ws.httprequest.soptions != null) {
                                        if (this.ws.httprequest.soptions.notifyTitle != null) { notifyTitle = this.ws.httprequest.soptions.notifyTitle; }
                                        if (this.ws.httprequest.soptions.notifyMsgDesktop != null) { notifyMessage = this.ws.httprequest.soptions.notifyMsgDesktop.replace('{0}', this.ws.httprequest.realname).replace('{1}', this.ws.httprequest.username); }
                                    }
                                    try { require('toaster').Toast(notifyTitle, notifyMessage, tsid); } catch (e) { }
                                }
                                if (this.ws.httprequest.consent && (this.ws.httprequest.consent & 0x40)) {
                                    // Connection Bar is required
                                    if (this.ws.httprequest.desktop.kvm.connectionBar) {
                                        this.ws.httprequest.desktop.kvm.connectionBar.removeAllListeners('close');
                                        this.ws.httprequest.desktop.kvm.connectionBar.close();
                                    }
                                    try {
                                        this.ws.httprequest.desktop.kvm.connectionBar = require('notifybar-desktop')(this.ws.httprequest.privacybartext.replace('{0}', this.ws.httprequest.desktop.kvm.users.join(', ')).replace('{1}', this.ws.httprequest.desktop.kvm.rusers.join(', ')), require('MeshAgent')._tsid);
                                        MeshServerLogEx(31, null, "Remote Desktop Connection Bar Activated/Updated (" + this.ws.httprequest.remoteaddr + ")", this.ws.httprequest);
                                    }
                                    catch (e) {
                                        if (process.platform != 'darwin') {
                                            MeshServerLogEx(32, null, "Remote Desktop Connection Bar Failed or Not Supported (" + this.ws.httprequest.remoteaddr + ")", this.ws.httprequest);
                                        }
                                    }
                                    if (this.ws.httprequest.desktop.kvm.connectionBar) {
                                        this.ws.httprequest.desktop.kvm.connectionBar.httprequest = this.ws.httprequest;
                                        this.ws.httprequest.desktop.kvm.connectionBar.on('close', function () {
                                            MeshServerLogEx(33, null, "Remote Desktop Connection forcefully closed by local user (" + this.httprequest.remoteaddr + ")", this.httprequest);
                                            for (var i in this.httprequest.desktop.kvm._pipedStreams) {
                                                this.httprequest.desktop.kvm._pipedStreams[i].end();
                                            }
                                            this.httprequest.desktop.kvm.end();
                                        });
                                    }
                                }
                                this.ws.httprequest.desktop.kvm.pipe(this.ws, { dataTypeSkip: 1 });
                                this.ws.resume();
                            },
                            function (e)
                            {
                                // User Consent Denied/Failed
                                this.ws._consentpromise = null;
                                MeshServerLogEx(34, null, "Failed to start remote desktop after local user rejected (" + this.ws.httprequest.remoteaddr + ")", this.ws.httprequest);
                                this.ws.end(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: e.toString(), msgid: 2 }));
                            });
                    } else {
                        // User Consent Prompt is not required
                        if (this.httprequest.consent && (this.httprequest.consent & 1)) {
                            // User Notifications is required
                            MeshServerLogEx(35, null, "Started remote desktop with toast notification (" + this.httprequest.remoteaddr + ")", this.httprequest);
                            var notifyMessage = this.httprequest.realname + " started a remote desktop session.", notifyTitle = "MeshCentral";
                            if (this.httprequest.soptions != null) {
                                if (this.httprequest.soptions.notifyTitle != null) { notifyTitle = this.httprequest.soptions.notifyTitle; }
                                if (this.httprequest.soptions.notifyMsgDesktop != null) { notifyMessage = this.httprequest.soptions.notifyMsgDesktop.replace('{0}', this.httprequest.realname).replace('{1}', this.httprequest.username); }
                            }
                            try { require('toaster').Toast(notifyTitle, notifyMessage, tsid); } catch (e) { }
                        } else {
                            MeshServerLogEx(36, null, "Started remote desktop without notification (" + this.httprequest.remoteaddr + ")", this.httprequest);
                        }
                        if (this.httprequest.consent && (this.httprequest.consent & 0x40)) {
                            // Connection Bar is required
                            if (this.httprequest.desktop.kvm.connectionBar) {
                                this.httprequest.desktop.kvm.connectionBar.removeAllListeners('close');
                                this.httprequest.desktop.kvm.connectionBar.close();
                            }
                            try {
                                this.httprequest.desktop.kvm.connectionBar = require('notifybar-desktop')(this.httprequest.privacybartext.replace('{0}', this.httprequest.desktop.kvm.rusers.join(', ')).replace('{1}', this.httprequest.desktop.kvm.users.join(', ')), require('MeshAgent')._tsid);
                                MeshServerLogEx(37, null, "Remote Desktop Connection Bar Activated/Updated (" + this.httprequest.remoteaddr + ")", this.httprequest);
                            }
                            catch (e) {
                                MeshServerLogEx(38, null, "Remote Desktop Connection Bar Failed or not Supported (" + this.httprequest.remoteaddr + ")", this.httprequest);
                            }
                            if (this.httprequest.desktop.kvm.connectionBar) {
                                this.httprequest.desktop.kvm.connectionBar.httprequest = this.httprequest;
                                this.httprequest.desktop.kvm.connectionBar.on('close', function () {
                                    MeshServerLogEx(39, null, "Remote Desktop Connection forcefully closed by local user (" + this.httprequest.remoteaddr + ")", this.httprequest);
                                    for (var i in this.httprequest.desktop.kvm._pipedStreams) {
                                        this.httprequest.desktop.kvm._pipedStreams[i].end();
                                    }
                                    this.httprequest.desktop.kvm.end();
                                });
                            }
                        }
                        this.httprequest.desktop.kvm.pipe(this, { dataTypeSkip: 1 });
                    }

                    this.removeAllListeners('data');
                    this.on('data', onTunnelControlData);
                    //this.write('MeshCore KVM Hello!1');

                } else if (this.httprequest.protocol == 5) {
                    //
                    // Remote Files
                    //

                    // Check user access rights for files
                    if (((this.httprequest.rights & MESHRIGHT_REMOTECONTROL) == 0) || ((this.httprequest.rights != 0xFFFFFFFF) && ((this.httprequest.rights & MESHRIGHT_NOFILES) != 0))) {
                        // Disengage this tunnel, user does not have the rights to do this!!
                        this.httprequest.protocol = 999999;
                        this.httprequest.s.end();
                        sendConsoleText("Error: No files control rights.");
                        return;
                    }

                    this.descriptorMetadata = "Remote Files";

                    // Add the files session to the count to update the server
                    if (this.httprequest.userid != null) {
                        if (tunnelUserCount.files[this.httprequest.userid] == null) { tunnelUserCount.files[this.httprequest.userid] = 1; } else { tunnelUserCount.files[this.httprequest.userid]++; }
                        try { mesh.SendCommand({ action: 'sessions', type: 'files', value: tunnelUserCount.files }); } catch (e) { }
                        broadcastSessionsToRegisteredApps();
                    }

                    this.end = function () {
                        // Remove the files session from the count to update the server
                        if (this.httprequest.userid != null) {
                            if (tunnelUserCount.files[this.httprequest.userid] != null) { tunnelUserCount.files[this.httprequest.userid]--; if (tunnelUserCount.files[this.httprequest.userid] <= 0) { delete tunnelUserCount.files[this.httprequest.userid]; } }
                            try { mesh.SendCommand({ action: 'sessions', type: 'files', value: tunnelUserCount.files }); } catch (e) { }
                            broadcastSessionsToRegisteredApps();
                        }
                    };

                    // Perform notification if needed. Toast messages may not be supported on all platforms.
                    if (this.httprequest.consent && (this.httprequest.consent & 32)) {
                        // User Consent Prompt is required
                        // Send a console message back using the console channel, "\n" is supported.
                        this.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: "Waiting for user to grant access...", msgid: 1 }));
                        var consentMessage = this.httprequest.realname + " requesting remote file Access. Grant access?", consentTitle = 'MeshCentral';
                        if (this.httprequest.soptions != null) {
                            if (this.httprequest.soptions.consentTitle != null) { consentTitle = this.httprequest.soptions.consentTitle; }
                            if (this.httprequest.soptions.consentMsgFiles != null) { consentMessage = this.httprequest.soptions.consentMsgFiles.replace('{0}', this.httprequest.realname).replace('{1}', this.httprequest.username); }
                        }
                        var pr = require('message-box').create(consentTitle, consentMessage, 30);
                        pr.ws = this;
                        this.pause();
                        this._consentpromise = pr;
                        this.prependOnceListener('end', function () { if (this._consentpromise && this._consentpromise.close) { this._consentpromise.close(); } });
                        pr.then(
                            function ()
                            {
                                // Success
                                this.ws._consentpromise = null;
                                MeshServerLogEx(40, null, "Starting remote files after local user accepted (" + this.ws.httprequest.remoteaddr + ")", this.ws.httprequest);
                                this.ws.write(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: null }));
                                if (this.ws.httprequest.consent && (this.ws.httprequest.consent & 4)) {
                                    // User Notifications is required
                                    var notifyMessage = this.ws.httprequest.realname + " started a remote file session.", notifyTitle = "MeshCentral";
                                    if (this.ws.httprequest.soptions != null) {
                                        if (this.ws.httprequest.soptions.notifyTitle != null) { notifyTitle = this.ws.httprequest.soptions.notifyTitle; }
                                        if (this.ws.httprequest.soptions.notifyMsgFiles != null) { notifyMessage = this.ws.httprequest.soptions.notifyMsgFiles.replace('{0}', this.ws.httprequest.realname).replace('{1}', this.ws.httprequest.username); }
                                    }
                                    try { require('toaster').Toast(notifyTitle, notifyMessage); } catch (e) { }
                                }
                                this.ws.resume();
                            },
                            function (e)
                            {
                                // User Consent Denied/Failed
                                this.ws._consentpromise = null;
                                MeshServerLogEx(41, null, "Failed to start remote files after local user rejected (" + this.ws.httprequest.remoteaddr + ")", this.ws.httprequest);
                                this.ws.end(JSON.stringify({ ctrlChannel: '102938', type: 'console', msg: e.toString(), msgid: 2 }));
                            });
                    } else {
                        // User Consent Prompt is not required
                        if (this.httprequest.consent && (this.httprequest.consent & 4)) {
                            // User Notifications is required
                            MeshServerLogEx(42, null, "Started remote files with toast notification (" + this.httprequest.remoteaddr + ")", this.httprequest);
                            var notifyMessage = this.httprequest.realname + " started a remote file session.", notifyTitle = "MeshCentral";
                            if (this.httprequest.soptions != null) {
                                if (this.httprequest.soptions.notifyTitle != null) { notifyTitle = this.httprequest.soptions.notifyTitle; }
                                if (this.httprequest.soptions.notifyMsgFiles != null) { notifyMessage = this.httprequest.soptions.notifyMsgFiles.replace('{0}', this.httprequest.realname).replace('{1}', this.httprequest.username); }
                            }
                            try { require('toaster').Toast(notifyTitle, notifyMessage); } catch (e) { }
                        } else {
                            MeshServerLogEx(43, null, "Started remote files without notification (" + this.httprequest.remoteaddr + ")", this.httprequest);
                        }
                        this.resume();
                    }

                    // Setup files
                    // NOP
                }
            } else if (this.httprequest.protocol == 1) {
                // Send data into terminal stdin
                //this.write(data); // Echo back the keys (Does not seem to be a good idea)
            } else if (this.httprequest.protocol == 2) {
                // Send data into remote desktop
                if (this.httprequest.desktop.state == 0) {
                    this.write(Buffer.from(String.fromCharCode(0x11, 0xFE, 0x00, 0x00, 0x4D, 0x45, 0x53, 0x48, 0x00, 0x00, 0x00, 0x00, 0x02)));
                    this.httprequest.desktop.state = 1;
                } else {
                    this.httprequest.desktop.write(data);
                }
            } else if (this.httprequest.protocol == 5) {
                // Process files commands
                var cmd = null;
                try { cmd = JSON.parse(data); } catch (e) { };
                if (cmd == null) { return; }
                if ((cmd.ctrlChannel == '102938') || ((cmd.type == 'offer') && (cmd.sdp != null))) { onTunnelControlData(cmd, this); return; } // If this is control data, handle it now.
                if (cmd.action == undefined) { return; }
                //sendConsoleText('CMD: ' + JSON.stringify(cmd));

                if ((cmd.path != null) && (process.platform != 'win32') && (cmd.path[0] != '/')) { cmd.path = '/' + cmd.path; } // Add '/' to paths on non-windows
                //console.log(objToString(cmd, 0, ' '));
                switch (cmd.action) {
                    case 'ls': {
                        /*
                        // Close the watcher if required
                        var samepath = ((this.httprequest.watcher != undefined) && (cmd.path == this.httprequest.watcher.path));
                        if ((this.httprequest.watcher != undefined) && (samepath == false)) {
                            //console.log('Closing watcher: ' + this.httprequest.watcher.path);
                            //this.httprequest.watcher.close(); // TODO: This line causes the agent to crash!!!!
                            delete this.httprequest.watcher;
                        }
                        */

                        // Send the folder content to the browser
                        var response = getDirectoryInfo(cmd.path);
                        if (cmd.reqid != undefined) { response.reqid = cmd.reqid; }
                        this.write(Buffer.from(JSON.stringify(response)));

                        /*
                        // Start the directory watcher
                        if ((cmd.path != '') && (samepath == false)) {
                            var watcher = fs.watch(cmd.path, onFileWatcher);
                            watcher.tunnel = this.httprequest;
                            watcher.path = cmd.path;
                            this.httprequest.watcher = watcher;
                            //console.log('Starting watcher: ' + this.httprequest.watcher.path);
                        }
                        */
                        break;
                    }
                    case 'mkdir': {
                        // Create a new empty folder
                        fs.mkdirSync(cmd.path);
                        MeshServerLogEx(44, [cmd.path], "Create folder: \"" + cmd.path + "\"", this.httprequest);
                        break;
                    }
                    case 'rm': {
                        // Delete, possibly recursive delete
                        for (var i in cmd.delfiles) {
                            var p = obj.path.join(cmd.path, cmd.delfiles[i]), delcount = 0;
                            try { delcount = deleteFolderRecursive(p, cmd.rec); } catch (e) { }
                            if ((delcount == 1) && !cmd.rec) {
                                MeshServerLogEx(45, [p], "Delete: \"" + p + "\"", this.httprequest);
                            } else {
                                if (cmd.rec) {
                                    MeshServerLogEx(46, [p, delcount], "Delete recursive: \"" + p + "\", " + delcount + " element(s) removed", this.httprequest);
                                } else {
                                    MeshServerLogEx(47, [p, delcount], "Delete: \"" + p + "\", " + delcount + " element(s) removed", this.httprequest);
                                }
                            }
                        }
                        break;
                    }
                    case 'markcoredump': {
                        // If we are asking for the coredump file, set the right path.
                        var coreDumpPath = null;
                        if (process.platform == 'win32') {
                            if (fs.existsSync(process.coreDumpLocation)) { coreDumpPath = process.coreDumpLocation; }
                        } else {
                            if ((process.cwd() != '//') && fs.existsSync(process.cwd() + 'core')) { coreDumpPath = process.cwd() + 'core'; }
                        }
                        if (coreDumpPath != null) { db.Put('CoreDumpTime', require('fs').statSync(coreDumpPath).mtime); }
                        break;
                    }
                    case 'rename': {
                        // Rename a file or folder
                        var oldfullpath = obj.path.join(cmd.path, cmd.oldname);
                        var newfullpath = obj.path.join(cmd.path, cmd.newname);
                        MeshServerLogEx(48, [oldfullpath, cmd.newname], 'Rename: \"' + oldfullpath + '\" to \"' + cmd.newname + '\"', this.httprequest);
                        try { fs.renameSync(oldfullpath, newfullpath); } catch (e) { console.log(e); }
                        break;
                    }
                    case 'download': {
                        // Download a file
                        var sendNextBlock = 0;
                        if (cmd.sub == 'start') { // Setup the download
                            if ((cmd.path == null) && (cmd.ask == 'coredump')) { // If we are asking for the coredump file, set the right path.
                                if (process.platform == 'win32') {
                                    if (fs.existsSync(process.coreDumpLocation)) { cmd.path = process.coreDumpLocation; }
                                } else {
                                    if ((process.cwd() != '//') && fs.existsSync(process.cwd() + 'core')) { cmd.path = process.cwd() + 'core'; }
                                }
                            }
                            MeshServerLogEx(49, [cmd.path], 'Download: \"' + cmd.path + '\"', this.httprequest);
                            if ((cmd.path == null) || (this.filedownload != null)) { this.write({ action: 'download', sub: 'cancel', id: this.filedownload.id }); delete this.filedownload; }
                            this.filedownload = { id: cmd.id, path: cmd.path, ptr: 0 }
                            try { this.filedownload.f = fs.openSync(this.filedownload.path, 'rbN'); } catch (e) { this.write({ action: 'download', sub: 'cancel', id: this.filedownload.id }); delete this.filedownload; }
                            if (this.filedownload) { this.write({ action: 'download', sub: 'start', id: cmd.id }); }
                        } else if ((this.filedownload != null) && (cmd.id == this.filedownload.id)) { // Download commands
                            if (cmd.sub == 'startack') { sendNextBlock = ((typeof cmd.ack == 'number') ? cmd.ack : 8); } else if (cmd.sub == 'stop') { delete this.filedownload; } else if (cmd.sub == 'ack') { sendNextBlock = 1; }
                        }
                        // Send the next download block(s)
                        while (sendNextBlock > 0) {
                            sendNextBlock--;
                            var buf = Buffer.alloc(16384);
                            var len = fs.readSync(this.filedownload.f, buf, 4, 16380, null);
                            this.filedownload.ptr += len;
                            if (len < 16380) { buf.writeInt32BE(0x01000001, 0); fs.closeSync(this.filedownload.f); delete this.filedownload; sendNextBlock = 0; } else { buf.writeInt32BE(0x01000000, 0); }
                            this.write(buf.slice(0, len + 4)); // Write as binary
                        }
                        break;
                    }
                    /*
                    case 'download': {
                        // Packet download of a file, agent to browser
                        if (cmd.path == undefined) break;
                        var filepath = cmd.name ? obj.path.join(cmd.path, cmd.name) : cmd.path;
                        //console.log('Download: ' + filepath);
                        try { this.httprequest.downloadFile = fs.openSync(filepath, 'rbN'); } catch (e) { this.write(Buffer.from(JSON.stringify({ action: 'downloaderror', reqid: cmd.reqid }))); break; }
                        this.httprequest.downloadFileId = cmd.reqid;
                        this.httprequest.downloadFilePtr = 0;
                        if (this.httprequest.downloadFile) { this.write(Buffer.from(JSON.stringify({ action: 'downloadstart', reqid: this.httprequest.downloadFileId }))); }
                        break;
                    }
                    case 'download2': {
                        // Stream download of a file, agent to browser
                        if (cmd.path == undefined) break;
                        var filepath = cmd.name ? obj.path.join(cmd.path, cmd.name) : cmd.path;
                        try { this.httprequest.downloadFile = fs.createReadStream(filepath, { flags: 'rbN' }); } catch (e) { console.log(e); }
                        this.httprequest.downloadFile.pipe(this);
                        this.httprequest.downloadFile.end = function () { }
                        break;
                    }
                    */
                    case 'upload': {
                        // Upload a file, browser to agent
                        if (this.httprequest.uploadFile != null) { fs.closeSync(this.httprequest.uploadFile); delete this.httprequest.uploadFile; }
                        if (cmd.path == undefined) break;
                        var filepath = cmd.name ? obj.path.join(cmd.path, cmd.name) : cmd.path;
                        this.httprequest.uploadFilePath = filepath;
                        MeshServerLogEx(50, [filepath], 'Upload: \"' + filepath + '\"', this.httprequest);
                        try { this.httprequest.uploadFile = fs.openSync(filepath, 'wbN'); } catch (e) { this.write(Buffer.from(JSON.stringify({ action: 'uploaderror', reqid: cmd.reqid }))); break; }
                        this.httprequest.uploadFileid = cmd.reqid;
                        if (this.httprequest.uploadFile) { this.write(Buffer.from(JSON.stringify({ action: 'uploadstart', reqid: this.httprequest.uploadFileid }))); }
                        break;
                    }
                    case 'uploaddone': {
                        // Indicates that an upload is done
                        if (this.httprequest.uploadFile) {
                            fs.closeSync(this.httprequest.uploadFile);
                            this.write(Buffer.from(JSON.stringify({ action: 'uploaddone', reqid: this.httprequest.uploadFileid }))); // Indicate that we closed the file.
                            delete this.httprequest.uploadFile;
                            delete this.httprequest.uploadFileid;
                            delete this.httprequest.uploadFilePath;
                        }
                        break;
                    }
                    case 'uploadcancel': {
                        // Indicates that an upload is canceled
                        if (this.httprequest.uploadFile) {
                            fs.closeSync(this.httprequest.uploadFile);
                            fs.unlinkSync(this.httprequest.uploadFilePath);
                            this.write(Buffer.from(JSON.stringify({ action: 'uploadcancel', reqid: this.httprequest.uploadFileid }))); // Indicate that we closed the file.
                            delete this.httprequest.uploadFile;
                            delete this.httprequest.uploadFileid;
                            delete this.httprequest.uploadFilePath;
                        }
                        break;
                    }
                    case 'copy': {
                        // Copy a bunch of files from scpath to dspath
                        for (var i in cmd.names) {
                            var sc = obj.path.join(cmd.scpath, cmd.names[i]), ds = obj.path.join(cmd.dspath, cmd.names[i]);
                            MeshServerLogEx(51, [sc, ds], 'Copy: \"' + sc + '\" to \"' + ds + '\"', this.httprequest);
                            if (sc != ds) { try { fs.copyFileSync(sc, ds); } catch (e) { } }
                        }
                        break;
                    }
                    case 'move': {
                        // Move a bunch of files from scpath to dspath
                        for (var i in cmd.names) {
                            var sc = obj.path.join(cmd.scpath, cmd.names[i]), ds = obj.path.join(cmd.dspath, cmd.names[i]);
                            MeshServerLogEx(52, [sc, ds], 'Move: \"' + sc + '\" to \"' + ds + '\"', this.httprequest);
                            if (sc != ds) { try { fs.copyFileSync(sc, ds); fs.unlinkSync(sc); } catch (e) { } }
                        }
                        break;
                    }
                    case 'zip':
                        // Zip a bunch of files
                        if (this.zip != null) return; // Zip operating is currently running, exit now.

                        // Check that the specified files exist & build full paths
                        var fp, stat, p = [];
                        for (var i in cmd.files) { fp = cmd.path + '/' + cmd.files[i]; stat = null; try { stat = fs.statSync(fp); } catch (e) { } if (stat != null) { p.push(fp); } }
                        if (p.length == 0) return; // No files, quit now.

                        // Setup file compression
                        var ofile = cmd.path + '/' + cmd.output;
                        this.write(Buffer.from(JSON.stringify({ action: 'dialogmessage', msg: 'zipping' })));
                        this.zipfile = ofile;
                        delete this.zipcancel;
                        var out = require('fs').createWriteStream(ofile, { flags: 'wb' });
                        out.xws = this;
                        out.on('close', function () {
                            this.xws.write(Buffer.from(JSON.stringify({ action: 'dialogmessage', msg: null })));
                            this.xws.write(Buffer.from(JSON.stringify({ action: 'refresh' })));
                            if (this.xws.zipcancel === true) { fs.unlinkSync(this.xws.zipfile); } // Delete the complete file.
                            delete this.xws.zipcancel;
                            delete this.xws.zipfile;
                            delete this.xws.zip;
                        });
                        this.zip = require('zip-writer').write({ files: p, basePath: cmd.path });
                        this.zip.xws = this;
                        this.zip.on('progress', require('events').moderated(function (name, p) { this.xws.write(Buffer.from(JSON.stringify({ action: 'dialogmessage', msg: 'zippingFile', file: ((process.platform == 'win32') ? (name.split('/').join('\\')) : name), progress: p }))); }, 1000));
                        this.zip.pipe(out);
                        break;
                    case 'cancel':
                        // Cancel zip operation if present
                        try { this.zipcancel = true; this.zip.cancel(function () { }); } catch (e) { }
                        this.zip = null;
                        break;
                    default:
                        // Unknown action, ignore it.
                        break;
                }
            } else if (this.httprequest.protocol == 7) { // Plugin data exchange
                var cmd = null;
                try { cmd = JSON.parse(data); } catch (e) { };
                if (cmd == null) { return; }
                if ((cmd.ctrlChannel == '102938') || ((cmd.type == 'offer') && (cmd.sdp != null))) { onTunnelControlData(cmd, this); return; } // If this is control data, handle it now.
                if (cmd.action == undefined) return;

                switch (cmd.action) {
                    case 'plugin': {
                        try { require(cmd.plugin).consoleaction(cmd, null, null, this); } catch (e) { throw e; }
                        break;
                    }
                    default: {
                        // probably shouldn't happen, but just in case this feature is expanded
                    }
                }

            }
            //sendConsoleText("Got tunnel #" + this.httprequest.index + " data: " + data, this.httprequest.sessionid);
        }
    }

    // Delete a directory with a files and directories within it
    function deleteFolderRecursive(path, rec) {
        var count = 0;
        if (fs.existsSync(path)) {
            if (rec == true) {
                fs.readdirSync(obj.path.join(path, '*')).forEach(function (file, index) {
                    var curPath = obj.path.join(path, file);
                    if (fs.statSync(curPath).isDirectory()) { // recurse
                        count += deleteFolderRecursive(curPath, true);
                    } else { // delete file
                        fs.unlinkSync(curPath);
                        count++;
                    }
                });
            }
            fs.unlinkSync(path);
            count++;
        }
        return count;
    };

    // Called when receiving control data on WebRTC
    function onTunnelWebRTCControlData(data) {
        if (typeof data != 'string') return;
        var obj;
        try { obj = JSON.parse(data); } catch (e) { sendConsoleText('Invalid control JSON on WebRTC: ' + data); return; }
        if (obj.type == 'close') {
            //sendConsoleText('Tunnel #' + this.xrtc.websocket.tunnel.index + ' WebRTC control close');
            try { this.close(); } catch (e) { }
            try { this.xrtc.close(); } catch (e) { }
        }
    }

    // Called when receiving control data on websocket
    function onTunnelControlData(data, ws) {
        var obj;
        if (ws == null) { ws = this; }
        if (typeof data == 'string') { try { obj = JSON.parse(data); } catch (e) { sendConsoleText('Invalid control JSON: ' + data); return; } }
        else if (typeof data == 'object') { obj = data; } else { return; }
        //sendConsoleText('onTunnelControlData(' + ws.httprequest.protocol + '): ' + JSON.stringify(data));
        //console.log('onTunnelControlData: ' + JSON.stringify(data));

        if (obj.action) {
            switch (obj.action) {
                case 'lock': {
                    // Lock the current user out of the desktop
                    try {
                        if (process.platform == 'win32') {
                            MeshServerLogEx(53, null, "Locking remote user out of desktop", ws.httprequest);
                            var child = require('child_process');
                            child.execFile(process.env['windir'] + '\\system32\\cmd.exe', ['/c', 'RunDll32.exe user32.dll,LockWorkStation'], { type: 1 });
                        }
                    } catch (e) { }
                    break;
                }
                default:
                    // Unknown action, ignore it.
                    break;
            }
            return;
        }

        switch (obj.type) {
            case 'options': {
                // These are additional connection options passed in the control channel.
                //sendConsoleText('options: ' + JSON.stringify(obj));
                delete obj.type;
                ws.httprequest.xoptions = obj;

                // Set additional user consent options if present
                if ((obj != null) && (typeof obj.consent == 'number')) { ws.httprequest.consent |= obj.consent; }

                break;
            }
            case 'close': {
                // We received the close on the websocket
                //sendConsoleText('Tunnel #' + ws.tunnel.index + ' WebSocket control close');
                try { ws.close(); } catch (e) { }
                break;
            }
            case 'termsize': {
                // Indicates a change in terminal size
                if (process.platform == 'win32')
                {
                    if (ws.httprequest._dispatcher == null) return;
                    //sendConsoleText('Win32-TermSize: ' + obj.cols + 'x' + obj.rows);
                    if (ws.httprequest._dispatcher.invoke) { ws.httprequest._dispatcher.invoke('resizeTerminal', [obj.cols, obj.rows]); }
                } else
                {
                    if (ws.httprequest.process == null || ws.httprequest.process.pty == 0) return;
                    //sendConsoleText('Linux Resize: ' + obj.cols + 'x' + obj.rows);

                    if (ws.httprequest.process.tcsetsize) { ws.httprequest.process.tcsetsize(obj.rows, obj.cols); }
                }
                break;
            }
            case 'webrtc0': { // Browser indicates we can start WebRTC switch-over.
                if (ws.httprequest.protocol == 1) { // Terminal
                    // This is a terminal data stream, unpipe the terminal now and indicate to the other side that terminal data will no longer be received over WebSocket
                    if (process.platform == 'win32') {
                        ws.httprequest._term.unpipe(ws);
                    } else {
                        ws.httprequest.process.stdout.unpipe(ws);
                        ws.httprequest.process.stderr.unpipe(ws);
                    }
                } else if (ws.httprequest.protocol == 2) { // Desktop
                    // This is a KVM data stream, unpipe the KVM now and indicate to the other side that KVM data will no longer be received over WebSocket
                    ws.httprequest.desktop.kvm.unpipe(ws);
                } else {
                    // Switch things around so all WebRTC data goes to onTunnelData().
                    ws.rtcchannel.httprequest = ws.httprequest;
                    ws.rtcchannel.removeAllListeners('data');
                    ws.rtcchannel.on('data', onTunnelData);
                }
                ws.write("{\"ctrlChannel\":\"102938\",\"type\":\"webrtc1\"}"); // End of data marker
                break;
            }
            case 'webrtc1': {
                if ((ws.httprequest.protocol == 1) || (ws.httprequest.protocol == 6)) { // Terminal
                    // Switch the user input from websocket to webrtc at this point.
                    if (process.platform == 'win32') {
                        ws.unpipe(ws.httprequest._term);
                        ws.rtcchannel.pipe(ws.httprequest._term, { dataTypeSkip: 1 }); // 0 = Binary, 1 = Text.
                    } else {
                        ws.unpipe(ws.httprequest.process.stdin);
                        ws.rtcchannel.pipe(ws.httprequest.process.stdin, { dataTypeSkip: 1 }); // 0 = Binary, 1 = Text.
                    }
                    ws.resume(); // Resume the websocket to keep receiving control data
                } else if (ws.httprequest.protocol == 2) { // Desktop
                    // Switch the user input from websocket to webrtc at this point.
                    ws.unpipe(ws.httprequest.desktop.kvm);
                    try { ws.webrtc.rtcchannel.pipe(ws.httprequest.desktop.kvm, { dataTypeSkip: 1, end: false }); } catch (e) { sendConsoleText('EX2'); } // 0 = Binary, 1 = Text.
                    ws.resume(); // Resume the websocket to keep receiving control data
                }
                ws.write('{\"ctrlChannel\":\"102938\",\"type\":\"webrtc2\"}'); // Indicates we will no longer get any data on websocket, switching to WebRTC at this point.
                break;
            }
            case 'webrtc2': {
                // Other side received websocket end of data marker, start sending data on WebRTC channel
                if ((ws.httprequest.protocol == 1) || (ws.httprequest.protocol == 6)) { // Terminal
                    if (process.platform == 'win32') {
                        ws.httprequest._term.pipe(ws.webrtc.rtcchannel, { dataTypeSkip: 1, end: false }); // 0 = Binary, 1 = Text.
                    } else {
                        ws.httprequest.process.stdout.pipe(ws.webrtc.rtcchannel, { dataTypeSkip: 1, end: false }); // 0 = Binary, 1 = Text.
                        ws.httprequest.process.stderr.pipe(ws.webrtc.rtcchannel, { dataTypeSkip: 1, end: false }); // 0 = Binary, 1 = Text.
                    }
                } else if (ws.httprequest.protocol == 2) { // Desktop
                    ws.httprequest.desktop.kvm.pipe(ws.webrtc.rtcchannel, { dataTypeSkip: 1 }); // 0 = Binary, 1 = Text.
                }
                break;
            }
            case 'offer': {
                // This is a WebRTC offer.
                if ((ws.httprequest.protocol == 1) || (ws.httprequest.protocol == 6)) return; // TODO: Terminal is currently broken with WebRTC. Reject WebRTC upgrade for now.
                ws.webrtc = rtc.createConnection();
                ws.webrtc.websocket = ws;
                ws.webrtc.on('connected', function () { /*sendConsoleText('Tunnel #' + this.websocket.tunnel.index + ' WebRTC connected');*/ });
                ws.webrtc.on('disconnected', function () { /*sendConsoleText('Tunnel #' + this.websocket.tunnel.index + ' WebRTC disconnected');*/ });
                ws.webrtc.on('dataChannel', function (rtcchannel) {
                    //sendConsoleText('WebRTC Datachannel open, protocol: ' + this.websocket.httprequest.protocol);
                    rtcchannel.maxFragmentSize = 32768;
                    rtcchannel.xrtc = this;
                    rtcchannel.websocket = this.websocket;
                    this.rtcchannel = rtcchannel;
                    this.websocket.rtcchannel = rtcchannel;
                    this.websocket.rtcchannel.on('data', onTunnelWebRTCControlData);
                    this.websocket.rtcchannel.on('end', function () {
                        // The WebRTC channel closed, unpipe the KVM now. This is also done when the web socket closes.
                        //sendConsoleText('Tunnel #' + this.websocket.tunnel.index + ' WebRTC data channel closed');
                        if (this.websocket.desktop && this.websocket.desktop.kvm)
                        {
                            try
                            {
                                this.unpipe(this.websocket.desktop.kvm);
                                this.websocket.httprequest.desktop.kvm.unpipe(this);
                            }
                            catch (e) { }
                        }
                    });
                    this.websocket.write('{\"ctrlChannel\":\"102938\",\"type\":\"webrtc0\"}'); // Indicate we are ready for WebRTC switch-over.
                });
                var sdp = null;
                try { sdp = ws.webrtc.setOffer(obj.sdp); } catch (e) { }
                if (sdp != null) { ws.write({ type: 'answer', ctrlChannel: '102938', sdp: sdp }); }
                break;
            }
            case 'ping': {
                ws.write("{\"ctrlChannel\":\"102938\",\"type\":\"pong\"}"); // Send pong response
                break;
            }
            case 'pong': { // NOP
                break;
            }
            case 'rtt': {
                ws.write({ type: 'rtt', ctrlChannel: '102938', time: obj.time });
                break;
            }
        }
    }

    // Console state
    var consoleWebSockets = {};
    var consoleHttpRequest = null;

    // Console HTTP response
    function consoleHttpResponse(response) {
        response.data = function (data) { sendConsoleText(rstr2hex(buf2rstr(data)), this.sessionid); consoleHttpRequest = null; }
        response.close = function () { sendConsoleText('httprequest.response.close', this.sessionid); consoleHttpRequest = null; }
    };

    // Open a web browser to a specified URL on current user's desktop
    function openUserDesktopUrl(url) {
        if ((url.toLowerCase().startsWith('http://') == false) && (url.toLowerCase().startsWith('https://') == false)) { return null; }
        var child = null;
        try {
            switch (process.platform) {
                case 'win32':
                    var user = require('user-sessions').getUsername(require('user-sessions').consoleUid());
                    child = require('child_process').execFile(process.env['windir'] + '\\system32\\cmd.exe', ['cmd']);
                    child.stderr.on('data', function () { });
                    child.stdout.on('data', function () { });
                    child.stdin.write('SCHTASKS /CREATE /F /TN MeshChatTask /SC ONCE /ST 00:00 /RU ' + user + ' /TR "' + process.env['windir'] + '\\system32\\cmd.exe /C START ' + url + '"\r\n');
                    child.stdin.write('SCHTASKS /RUN /TN MeshChatTask\r\n');
                    child.stdin.write('SCHTASKS /DELETE /F /TN MeshChatTask\r\n');
                    child.stdin.write('exit\r\n');
                    child.waitExit();
                    break;
                case 'linux':
                    child = require('child_process').execFile('/usr/bin/xdg-open', ['xdg-open', url], { uid: require('user-sessions').consoleUid() });
                    break;
                case 'darwin':
                    child = require('child_process').execFile('/usr/bin/open', ['open', url], { uid: require('user-sessions').consoleUid() });
                    break;
                default:
                    // Unknown platform, ignore this command.
                    break;
            }
        } catch (e) { }
        return child;
    }

    // Process a mesh agent console command
    function processConsoleCommand(cmd, args, rights, sessionid) {
        try {
            var response = null;
            switch (cmd) {
                case 'help': { // Displays available commands
                    var fin = '', f = '', availcommands = 'coreinfo,coredump,service,fdsnapshot,fdcount,startupoptions,alert,agentsize,versions,help,info,osinfo,args,print,type,dbkeys,dbget,dbset,dbcompact,eval,parseuri,httpget,nwslist,plugin,wsconnect,wssend,wsclose,notify,ls,ps,kill,netinfo,location,power,wakeonlan,setdebug,smbios,rawsmbios,toast,lock,users,openurl,getscript,getclip,setclip,log,av,cpuinfo,sysinfo,apf,scanwifi,wallpaper,agentmsg';
                    if (process.platform == 'win32') { availcommands += ',safemode,wpfhwacceleration,uac'; }
                    if (amt != null) { availcommands += ',amt,amtconfig,amtevents'; }
		            if (process.platform != 'freebsd') { availcommands += ',vm';}                    
                    if (require('MeshAgent').maxKvmTileSize != null) { availcommands += ',kvmmode'; }
                    try { require('zip-reader'); availcommands += ',zip,unzip'; } catch (e) { }

                    availcommands = availcommands.split(',').sort();
                    while (availcommands.length > 0) {
                        if (f.length > 90) { fin += (f + ',\r\n'); f = ''; }
                        f += (((f != '') ? ', ' : ' ') + availcommands.shift());
                    }
                    if (f != '') { fin += f; }
                    response = "Available commands: \r\n" + fin + ".";
                    break;
                }
                case 'find':
                    if (args['_'].length <= 1)
                    {
                        response = "Proper usage:\r\n  find root criteria [criteria2] [criteria n...]";
                    }
                    else
                    {
                        var root = args['_'][0];
                        var p = args['_'].slice(1);
                        var r = require('file-search').find(root, p);
                        r.sid = sessionid;
                        r.on('result', function (str) { sendConsoleText(str, this.sid); });
                        r.then(function () { sendConsoleText('*** End Results ***', this.sid); });
                        response = "Find: [" + root + "] " + JSON.stringify(p);
                    }
                    break;
                case 'coreinfo': {
                    response = JSON.stringify(meshCoreObj, null, 2);
                    break;
                }
                case 'coreinfoupdate': {
                    sendPeriodicServerUpdate();
                    break;
                }
                case 'agentmsg': {
                    if (args['_'].length == 0) {
                        response = "Proper usage:\r\n  agentmsg add \"[message]\" [iconIndex]\r\n  agentmsg remove [index]\r\n  agentmsg list"; // Display usage
                    } else {
                        if ((args['_'][0] == 'add') && (args['_'].length > 1)) {
                            var msgIndex = 1, iconIndex = 0;
                            while (tunnelUserCount.msg[msgIndex] != null) { msgIndex++; }
                            if (args['_'].length >= 3) { try { iconIndex = parseInt(args['_'][2]); } catch (e) { } }
                            if (typeof iconIndex != 'number') { iconIndex = 0; }
                            tunnelUserCount.msg[msgIndex] = { msg: args['_'][1], icon: iconIndex };
                            response = 'Agent message ' + msgIndex + ' added.';
                        } else if ((args['_'][0] == 'remove') && (args['_'].length > 1)) {
                            var msgIndex = 0;
                            try { msgIndex = parseInt(args['_'][1]); } catch (x) { }
                            if (tunnelUserCount.msg[msgIndex] == null) { response = "Message not found."; } else { delete tunnelUserCount.msg[msgIndex]; response = "Message removed."; }
                        } else if (args['_'][0] == 'list') {
                            response = JSON.stringify(tunnelUserCount.msg, null, 2);
                        }
                        try { mesh.SendCommand({ action: 'sessions', type: 'msg', value: tunnelUserCount.msg }); } catch (x) { }
                        broadcastSessionsToRegisteredApps();
                    }
                    break;
                }
                case 'clearagentmsg': {
                    tunnelUserCount.msg = {};
                    try { mesh.SendCommand({ action: 'sessions', type: 'msg', value: tunnelUserCount.msg }); } catch (x) { }
                    broadcastSessionsToRegisteredApps();
                    break;
                }
                case 'coredump':
                    if (args['_'].length != 1) {
                        response = "Proper usage: coredump on|off|status|clear"; // Display usage
                    } else {
                        switch (args['_'][0].toLowerCase())
                        {
                            case 'on':
                                process.coreDumpLocation = (process.platform == 'win32') ? (process.execPath.replace('.exe', '.dmp')) : (process.execPath + '.dmp');
                                response = 'coredump is now on';
                                break;
                            case 'off':
                                process.coreDumpLocation = null;
                                response = 'coredump is now off';
                                break;
                            case 'status':
                                response = 'coredump is: ' + ((process.coreDumpLocation == null) ? 'off' : 'on');
                                if (process.coreDumpLocation != null) {
                                    if (process.platform == 'win32') {
                                        if (fs.existsSync(process.coreDumpLocation)) {
                                            response += '\r\n  CoreDump present at: ' + process.coreDumpLocation;
                                            response += '\r\n  CoreDump Time: ' + new Date(fs.statSync(process.coreDumpLocation).mtime).getTime();
                                            response += '\r\n  Agent Time   : ' + new Date(fs.statSync(process.execPath).mtime).getTime();
                                        }
                                    } else {
                                        if ((process.cwd() != '//') && fs.existsSync(process.cwd() + 'core')) {
                                            response += '\r\n  CoreDump present at: ' + process.cwd() + 'core';
                                            response += '\r\n  CoreDump Time: ' + new Date(fs.statSync(process.cwd() + 'core').mtime).getTime();
                                            response += '\r\n  Agent Time   : ' + new Date(fs.statSync(process.execPath).mtime).getTime();
                                        }
                                    }
                                }
                                break;
                            case 'clear':
                                db.Put('CoreDumpTime', null);
                                response = 'coredump db cleared';
                                break;
                            default:
                                response = "Proper usage: coredump on|off|status"; // Display usage
                                break;
                        }
                    }
                    break;
                case 'service':
                    if (args['_'].length != 1)
                    {
                        response = "Proper usage: service status|restart"; // Display usage
                    }
                    else
                    {
                        var s = require('service-manager').manager.getService(process.platform == 'win32' ? 'Mesh Agent' : 'meshagent');
                        switch(args['_'][0].toLowerCase())
                        {
                            case 'status':
                                response = 'Service ' + (s.isRunning() ? (s.isMe() ? '[SELF]' : '[RUNNING]') : ('[NOT RUNNING]'));
                                break;
                            case 'restart':
                                if (s.isMe())
                                {
                                    s.restart();
                                }
                                else
                                {
                                    response = 'Restarting another agent instance is not allowed';
                                }
                                break;
                            default:
                                response = "Proper usage: service status|restart"; // Display usage
                                break;
                        }
                        if (process.platform == 'win32') { s.close(); }
                    }
                    break;
                case 'zip':
                    if (args['_'].length == 0) {
                        response = "Proper usage: zip (output file name), input1 [, input n]"; // Display usage
                    } else {
                        var p = args['_'].join(' ').split(',');
                        var ofile = p.shift();
                        sendConsoleText('Writing ' + ofile + '...');
                        var out = require('fs').createWriteStream(ofile, { flags: 'wb' });
                        out.fname = ofile;
                        out.sessionid = sessionid;
                        out.on('close', function () { sendConsoleText('DONE writing ' + this.fname, this.sessionid); });
                        var zip = require('zip-writer').write({ files: p });
                        zip.pipe(out);
                    }
                    break;
                case 'unzip':
                    if (args['_'].length == 0) {
                        response = "Proper usage: unzip input, destination"; // Display usage
                    } else {
                        var p = args['_'].join(' ').split(',');
                        if (p.length != 2) { response = "Proper usage: unzip input, destination"; break; } // Display usage
                        var prom = require('zip-reader').read(p[0]);
                        prom._dest = p[1];
                        prom.self = this;
                        prom.sessionid = sessionid;
                        prom.then(function (zipped) {
                            sendConsoleText('Extracting to ' + this._dest + '...', this.sessionid);
                            zipped.extractAll(this._dest).then(function () { sendConsoleText('finished unzipping', this.sessionid); }, function (e) { sendConsoleText('Error unzipping: ' + e, this.sessionid); }).parentPromise.sessionid = this.sessionid;
                        }, function (e) { sendConsoleText('Error unzipping: ' + e, this.sessionid); });
                    }
                    break;
                case 'setbattery':
                    // require('MeshAgent').SendCommand({ action: 'battery', state: 'dc', level: 55 });
                    if ((args['_'].length > 0) && ((args['_'][0] == 'ac') || (args['_'][0] == 'dc'))) {
                        var b = { action: 'battery', state: args['_'][0] };
                        if (args['_'].length == 2) { b.level = parseInt(args['_'][1]); }
                        require('MeshAgent').SendCommand(b);
                    } else {
                        require('MeshAgent').SendCommand({ action: 'battery' });
                    }
                    break;
                case 'fdsnapshot':
                    require('ChainViewer').getSnapshot().then(function (c) { sendConsoleText(c, this.sessionid); }).parentPromise.sessionid = sessionid;
                    break;
                case 'fdcount':
                    require('DescriptorEvents').getDescriptorCount().then(
                        function (c)
                        {
                            sendConsoleText('Descriptor Count: ' + c, this.sessionid);
                        }, function (e)
                        {
                            sendConsoleText('Error fetching descriptor count: ' + e, this.sessionid);
                        }).parentPromise.sessionid = sessionid;
                    break;
                case 'uac':
                    if (process.platform != 'win32')
                    {
                        response = 'Unknown command "uac", type "help" for list of avaialble commands.';
                        break;
                    }
                    if (args['_'].length != 1)
                    {
                        response = 'Proper usage: uac [get|interactive|secure]';
                    }
                    else
                    {
                        switch(args['_'][0].toUpperCase())
                        {
                            case 'GET':
                                var secd = require('win-registry').QueryKey(require('win-registry').HKEY.LocalMachine, 'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'PromptOnSecureDesktop');
                                response = "UAC mode: " + (secd == 0 ? "Interactive Desktop" : "Secure Desktop");
                                break;
                            case 'INTERACTIVE':
                                try
                                {
                                    require('win-registry').WriteKey(require('win-registry').HKEY.LocalMachine, 'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'PromptOnSecureDesktop', 0);
                                    response = 'UAC mode changed to: Interactive Desktop';
                                }
                                catch (e)
                                {
                                    response = "Unable to change UAC Mode";
                                }
                                break;
                            case 'SECURE':
                                try
                                {
                                    require('win-registry').WriteKey(require('win-registry').HKEY.LocalMachine, 'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'PromptOnSecureDesktop', 1);
                                    response = 'UAC mode changed to: Secure Desktop';
                                }
                                catch(e)
                                {
                                    response = "Unable to change UAC Mode";
                                }
                                break;
                            default:
                                response = 'Proper usage: uac [get|interactive|secure]';
                                break;
                        }
                    }
                    break;
		        case 'vm':
			        response = 'Virtual Machine = ' + require('identifiers').isVM();
			        break;
                case 'startupoptions':
                    response = JSON.stringify(require('MeshAgent').getStartupOptions());
                    break;
                case 'kvmmode':
                    if (require('MeshAgent').maxKvmTileSize == null)
                    {
                        response = "Unknown command \"kvmmode\", type \"help\" for list of avaialble commands.";
                    }
                    else
                    {
                        if(require('MeshAgent').maxKvmTileSize == 0)
                        {
                            response = 'KVM Mode: Full JUMBO';
                        }
                        else 
                        {
                            response = 'KVM Mode: ' + (require('MeshAgent').maxKvmTileSize <= 65500 ? 'NO JUMBO' : 'Partial JUMBO');
                            response += (', TileLimit: ' + (require('MeshAgent').maxKvmTileSize < 1024 ? (require('MeshAgent').maxKvmTileSize + ' bytes') : (Math.round(require('MeshAgent').maxKvmTileSize/1024) + ' Kbytes')));
                        }
                    }
                    break;
                case 'alert':
                    if (args['_'].length ==  0)
                    {
                        response = "Proper usage: alert TITLE, CAPTION [, TIMEOUT]"; // Display usage
                    }
                    else
                    {
                        var p = args['_'].join(' ').split(',');
                        if(p.length<2)
                        {
                            response = "Proper usage: alert TITLE, CAPTION [, TIMEOUT]"; // Display usage
                        }
                        else
                        {
                            this._alert = require('message-box').create(p[0], p[1], p.length==3?parseInt(p[2]):9999,1);
                        }
                    }
                    break;
                case 'agentsize':
                    var actualSize = Math.floor(require('fs').statSync(process.execPath).size / 1024);
                    if (process.platform == 'win32') {
                        // Check the Agent Uninstall MetaData for correctness, as the installer may have written an incorrect value
                        var writtenSize = 0;
                        try { writtenSize = require('win-registry').QueryKey(require('win-registry').HKEY.LocalMachine, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MeshCentralAgent', 'EstimatedSize'); } catch (e) { response = e; }
                        if (writtenSize != actualSize) {
                            response = "Size updated from: " + writtenSize + " to: " + actualSize;
                            try { require('win-registry').WriteKey(require('win-registry').HKEY.LocalMachine, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MeshCentralAgent', 'EstimatedSize', actualSize); } catch (e) { response = e; }
                        } else { response = "Agent Size: " + actualSize + " kb"; }
                    } else { response = "Agent Size: " + actualSize + " kb"; }
                    break;
                case 'versions':
                    response = JSON.stringify(process.versions, null, '  ');
                    break;
                case 'wpfhwacceleration':
                    if (process.platform != 'win32') { throw ("wpfhwacceleration setting is only supported on Windows"); }
                    if (args['_'].length != 1) {
                        response = "Proper usage: wpfhwacceleration (ON|OFF|STATUS)"; // Display usage
                    }
                    else {
                        var reg = require('win-registry');
                        var uname = require('user-sessions').getUsername(require('user-sessions').consoleUid());
                        var key = reg.usernameToUserKey(uname);

                        switch (args['_'][0].toUpperCase()) {
                            default:
                                response = "Proper usage: wpfhwacceleration (ON|OFF|STATUS|DEFAULT)"; // Display usage
                                break;
                            case 'ON':
                                try {
                                    reg.WriteKey(reg.HKEY.Users, key + '\\SOFTWARE\\Microsoft\\Avalon.Graphics', 'DisableHWAcceleration', 0);
                                    response = "OK";
                                } catch (e) { response = "FAILED"; }
                                break;
                            case 'OFF':
                                try {
                                    reg.WriteKey(reg.HKEY.Users, key + '\\SOFTWARE\\Microsoft\\Avalon.Graphics', 'DisableHWAcceleration', 1);
                                    response = 'OK';
                                } catch (e) { response = 'FAILED'; }
                                break;
                            case 'STATUS':
                                var s;
                                try { s = reg.QueryKey(reg.HKEY.Users, key + '\\SOFTWARE\\Microsoft\\Avalon.Graphics', 'DisableHWAcceleration') == 1 ? 'DISABLED' : 'ENABLED'; } catch (e) { s = 'DEFAULT'; }
                                response = "WPF Hardware Acceleration: " + s;
                                break;
                            case 'DEFAULT':
                                try { reg.DeleteKey(reg.HKEY.Users, key + '\\SOFTWARE\\Microsoft\\Avalon.Graphics', 'DisableHWAcceleration'); } catch (e) { }
                                response = 'OK';
                                break;
                        }
                    }
                    break;
                case 'tsid':
                    if (process.platform == 'win32') {
                        if (args['_'].length != 1) {
                            response = "TSID: " + (require('MeshAgent')._tsid == null ? "console" : require('MeshAgent')._tsid);
                        } else {
                            var i = parseInt(args['_'][0]);
                            require('MeshAgent')._tsid = (isNaN(i) ? null : i);
                            response = "TSID set to: " + (require('MeshAgent')._tsid == null ? "console" : require('MeshAgent')._tsid);
                        }
                    } else { response = "TSID command only supported on Windows"; }
                    break;
                case 'activeusers':
                    if (process.platform == 'win32') {
                        var p = require('user-sessions').enumerateUsers();
                        p.sessionid = sessionid;
                        p.then(function (u) {
                            var v = [];
                            for (var i in u) {
                                if (u[i].State == 'Active') { v.push({ tsid: i, type: u[i].StationName, user: u[i].Username, domain: u[i].Domain }); }
                            }
                            sendConsoleText(JSON.stringify(v, null, 1), this.sessionid);
                        });
                    } else { response = "activeusers command only supported on Windows"; }
                    break;
                case 'wallpaper':
                    if (process.platform != 'win32' && !(process.platform == 'linux' && require('linux-gnome-helpers').available)) {
                        response = "wallpaper command not supported on this platform";
                    }
                    else {
                        if (args['_'].length != 1) {
                            response = 'Proper usage: wallpaper (GET|TOGGLE)'; // Display usage
                        }
                        else {
                            switch (args['_'][0].toUpperCase()) {
                                default:
                                    response = 'Proper usage: wallpaper (GET|TOGGLE)'; // Display usage
                                    break;
                                case 'GET':
                                case 'TOGGLE':
                                    if (process.platform == 'win32') {
                                        var id = require('user-sessions').getProcessOwnerName(process.pid).tsid == 0 ? 1 : 0;
                                        var child = require('child_process').execFile(process.execPath, [process.execPath.split('\\').pop(), '-b64exec', 'dmFyIFNQSV9HRVRERVNLV0FMTFBBUEVSID0gMHgwMDczOwp2YXIgU1BJX1NFVERFU0tXQUxMUEFQRVIgPSAweDAwMTQ7CnZhciBHTSA9IHJlcXVpcmUoJ19HZW5lcmljTWFyc2hhbCcpOwp2YXIgdXNlcjMyID0gR00uQ3JlYXRlTmF0aXZlUHJveHkoJ3VzZXIzMi5kbGwnKTsKdXNlcjMyLkNyZWF0ZU1ldGhvZCgnU3lzdGVtUGFyYW1ldGVyc0luZm9BJyk7CgppZiAocHJvY2Vzcy5hcmd2Lmxlbmd0aCA9PSAzKQp7CiAgICB2YXIgdiA9IEdNLkNyZWF0ZVZhcmlhYmxlKDEwMjQpOwogICAgdXNlcjMyLlN5c3RlbVBhcmFtZXRlcnNJbmZvQShTUElfR0VUREVTS1dBTExQQVBFUiwgdi5fc2l6ZSwgdiwgMCk7CiAgICBjb25zb2xlLmxvZyh2LlN0cmluZyk7CiAgICBwcm9jZXNzLmV4aXQoKTsKfQplbHNlCnsKICAgIHZhciBuYiA9IEdNLkNyZWF0ZVZhcmlhYmxlKHByb2Nlc3MuYXJndlszXSk7CiAgICB1c2VyMzIuU3lzdGVtUGFyYW1ldGVyc0luZm9BKFNQSV9TRVRERVNLV0FMTFBBUEVSLCBuYi5fc2l6ZSwgbmIsIDApOwogICAgcHJvY2Vzcy5leGl0KCk7Cn0='], { type: id });
                                        child.stdout.str = ''; child.stdout.on('data', function (c) { this.str += c.toString(); });
                                        child.stderr.on('data', function () { });
                                        child.waitExit();
                                        var current = child.stdout.str.trim();
                                        if (args['_'][0].toUpperCase() == 'GET') {
                                            response = current;
                                            break;
                                        }
                                        if (current != '') {
                                            require('MeshAgent')._wallpaper = current;
                                            response = 'Wallpaper cleared';
                                        } else {
                                            response = 'Wallpaper restored';
                                        }
                                        child = require('child_process').execFile(process.execPath, [process.execPath.split('\\').pop(), '-b64exec', 'dmFyIFNQSV9HRVRERVNLV0FMTFBBUEVSID0gMHgwMDczOwp2YXIgU1BJX1NFVERFU0tXQUxMUEFQRVIgPSAweDAwMTQ7CnZhciBHTSA9IHJlcXVpcmUoJ19HZW5lcmljTWFyc2hhbCcpOwp2YXIgdXNlcjMyID0gR00uQ3JlYXRlTmF0aXZlUHJveHkoJ3VzZXIzMi5kbGwnKTsKdXNlcjMyLkNyZWF0ZU1ldGhvZCgnU3lzdGVtUGFyYW1ldGVyc0luZm9BJyk7CgppZiAocHJvY2Vzcy5hcmd2Lmxlbmd0aCA9PSAzKQp7CiAgICB2YXIgdiA9IEdNLkNyZWF0ZVZhcmlhYmxlKDEwMjQpOwogICAgdXNlcjMyLlN5c3RlbVBhcmFtZXRlcnNJbmZvQShTUElfR0VUREVTS1dBTExQQVBFUiwgdi5fc2l6ZSwgdiwgMCk7CiAgICBjb25zb2xlLmxvZyh2LlN0cmluZyk7CiAgICBwcm9jZXNzLmV4aXQoKTsKfQplbHNlCnsKICAgIHZhciBuYiA9IEdNLkNyZWF0ZVZhcmlhYmxlKHByb2Nlc3MuYXJndlszXSk7CiAgICB1c2VyMzIuU3lzdGVtUGFyYW1ldGVyc0luZm9BKFNQSV9TRVRERVNLV0FMTFBBUEVSLCBuYi5fc2l6ZSwgbmIsIDApOwogICAgcHJvY2Vzcy5leGl0KCk7Cn0=', current != '' ? '""' : require('MeshAgent')._wallpaper], { type: id });
                                        child.stdout.str = ''; child.stdout.on('data', function (c) { this.str += c.toString(); });
                                        child.stderr.on('data', function () { });
                                        child.waitExit();
                                    }
                                    else {
                                        var id = require('user-sessions').consoleUid();
                                        var current = require('linux-gnome-helpers').getDesktopWallpaper(id);
                                        if (args['_'][0].toUpperCase() == 'GET') {
                                            response = current;
                                            break;
                                        }
                                        if (current != '/dev/null') {
                                            require('MeshAgent')._wallpaper = current;
                                            response = 'Wallpaper cleared';
                                        } else {
                                            response = 'Wallpaper restored';
                                        }
                                        require('linux-gnome-helpers').setDesktopWallpaper(id, current != '/dev/null' ? undefined : require('MeshAgent')._wallpaper);
                                    }
                                    break;
                            }
                        }
                    }
                    break;
                case 'safemode':
                    if (process.platform != 'win32') {
                        response = 'safemode only supported on Windows Platforms'
                    }
                    else {
                        if (args['_'].length != 1) {
                            response = 'Proper usage: safemode (ON|OFF|STATUS)'; // Display usage
                        }
                        else {
                            switch (args['_'][0].toUpperCase()) {
                                default:
                                    response = 'Proper usage: safemode (ON|OFF|STATUS)'; // Display usage
                                    break;
                                case 'ON':
                                    require('win-bcd').setKey('safeboot', 'Network');
                                    require('win-bcd').enableSafeModeService('Mesh Agent');
                                    break;
                                case 'OFF':
                                    require('win-bcd').deleteKey('safeboot');
                                    break;
                                case 'STATUS':
                                    var nextboot = require('win-bcd').getKey('safeboot');
                                    if (nextboot) {
                                        switch (nextboot) {
                                            case 'Network':
                                            case 'network':
                                                nextboot = 'SAFE_MODE_NETWORK';
                                                break;
                                            default:
                                                nextboot = 'SAFE_MODE';
                                                break;
                                        }
                                    }
                                    response = 'Current: ' + require('win-bcd').bootMode + ', NextBoot: ' + (nextboot ? nextboot : 'NORMAL');
                                    break;
                            }
                        }
                    }
                    break;
                /*
                case 'border':
                    {
                        if ((args['_'].length == 1) && (args['_'][0] == 'on')) {
                            if (meshCoreObj.users.length > 0) {
                                obj.borderManager.Start(meshCoreObj.users[0]);
                                response = 'Border blinking is on.';
                            } else {
                                response = 'Cannot turn on border blinking, no logged in users.';
                            }
                        } else if ((args['_'].length == 1) && (args['_'][0] == 'off')) {
                            obj.borderManager.Stop();
                            response = 'Border blinking is off.';
                        } else {
                            response = 'Proper usage: border "on|off"'; // Display correct command usage
                        }
                    }
                    break;
                */
                case 'av':
                    if (process.platform == 'win32') {
                        // Windows Command: "wmic /Namespace:\\root\SecurityCenter2 Path AntiVirusProduct get /FORMAT:CSV"
                        response = JSON.stringify(require('win-info').av(), null, 1);
                    } else {
                        response = 'Not supported on the platform';
                    }
                    break;
                case 'log':
                    if (args['_'].length != 1) { response = 'Proper usage: log "sample text"'; } else { MeshServerLog(args['_'][0]); response = 'ok'; }
                    break;
                case 'getclip':
                    if (require('MeshAgent').isService) {
                        require('clipboard').dispatchRead().then(function (str) { sendConsoleText(str, sessionid); });
                    } else {
                        require("clipboard").read().then(function (str) { sendConsoleText(str, sessionid); });
                    }
                    break;
                case 'setclip': {
                    if (args['_'].length != 1) {
                        response = 'Proper usage: setclip "sample text"';
                    } else {
                        if (require('MeshAgent').isService) {
                            require('clipboard').dispatchWrite(args['_'][0]);
                            response = 'Setting clipboard to: "' + args['_'][0] + '"';
                        }
                        else {
                            require("clipboard")(args['_'][0]); response = 'Setting clipboard to: "' + args['_'][0] + '"';
                        }
                    }
                    break;
                }
                case 'openurl': {
                    if (args['_'].length != 1) { response = 'Proper usage: openurl (url)'; } // Display usage
                    else { if (openUserDesktopUrl(args['_'][0]) == null) { response = 'Failed.'; } else { response = 'Success.'; } }
                    break;
                }
                case 'users': {
                    if (meshCoreObj.users == null) { response = 'Active users are unknown.'; } else { response = 'Active Users: ' + meshCoreObj.users.join(', ') + '.'; }
                    require('user-sessions').enumerateUsers().then(function (u) { for (var i in u) { sendConsoleText(u[i]); } });
                    break;
                }
                case 'toast': {
                    if (args['_'].length < 1) { response = 'Proper usage: toast "message"'; } else {
                        if (require('MeshAgent')._tsid == null) {
                            require('toaster').Toast('MeshCentral', args['_'][0]).then(sendConsoleText, sendConsoleText);
                        }
                        else {
                            require('toaster').Toast('MeshCentral', args['_'][0], require('MeshAgent')._tsid).then(sendConsoleText, sendConsoleText);
                        }
                    }
                    break;
                }
                case 'setdebug': {
                    if (args['_'].length < 1) { response = 'Proper usage: setdebug (target), 0 = Disabled, 1 = StdOut, 2 = This Console, * = All Consoles, 4 = WebLog, 8 = Logfile'; } // Display usage
                    else { if (args['_'][0] == '*') { console.setDestination(2); } else { console.setDestination(parseInt(args['_'][0]), sessionid); } }
                    break;
                }
                case 'ps': {
                    processManager.getProcesses(function (plist) {
                        var x = '';
                        for (var i in plist) { x += i + ((plist[i].user) ? (', ' + plist[i].user) : '') + ', ' + plist[i].cmd + '\r\n'; }
                        sendConsoleText(x, sessionid);
                    });
                    break;
                }
                case 'kill': {
                    if ((args['_'].length < 1)) {
                        response = 'Proper usage: kill [pid]'; // Display correct command usage
                    } else {
                        process.kill(parseInt(args['_'][0]));
                        response = 'Killed process ' + args['_'][0] + '.';
                    }
                    break;
                }
                case 'smbios': {
                    if (SMBiosTables == null) { response = 'SMBios tables not available.'; } else { response = objToString(SMBiosTables, 0, ' ', true); }
                    break;
                }
                case 'rawsmbios': {
                    if (SMBiosTablesRaw == null) { response = 'SMBios tables not available.'; } else {
                        response = '';
                        for (var i in SMBiosTablesRaw) {
                            var header = false;
                            for (var j in SMBiosTablesRaw[i]) {
                                if (SMBiosTablesRaw[i][j].length > 0) {
                                    if (header == false) { response += ('Table type #' + i + ((require('smbios').smTableTypes[i] == null) ? '' : (', ' + require('smbios').smTableTypes[i]))) + '\r\n'; header = true; }
                                    response += ('  ' + SMBiosTablesRaw[i][j].toString('hex')) + '\r\n';
                                }
                            }
                        }
                    }
                    break;
                }
                case 'eval': { // Eval JavaScript
                    if (args['_'].length < 1) {
                        response = 'Proper usage: eval "JavaScript code"'; // Display correct command usage
                    } else {
                        response = JSON.stringify(mesh.eval(args['_'][0])); // This can only be run by trusted administrator.
                    }
                    break;
                }
                case 'uninstallagent': // Uninstall this agent
                    var agentName = process.platform == 'win32' ? 'Mesh Agent' : 'meshagent';
                    if (!require('service-manager').manager.getService(agentName).isMe()) {
                        response = 'Uininstall failed, this instance is not the service instance';
                    } else {
                        try { diagnosticAgent_uninstall(); } catch (e) { }
                        var js = "require('service-manager').manager.getService('" + agentName + "').stop(); require('service-manager').manager.uninstallService('" + agentName + "'); process.exit();";
                        this.child = require('child_process').execFile(process.execPath, [process.platform == 'win32' ? (process.execPath.split('\\').pop()) : (process.execPath.split('/').pop()), '-b64exec', Buffer.from(js).toString('base64')], { type: 4, detached: true });
                    }
                    break;
                case 'notify': { // Send a notification message to the mesh
                    if (args['_'].length != 1) {
                        response = 'Proper usage: notify "message" [--session]'; // Display correct command usage
                    } else {
                        var notification = { action: 'msg', type: 'notify', value: args['_'][0], tag: 'console' };
                        if (args.session) { notification.sessionid = sessionid; } // If "--session" is specified, notify only this session, if not, the server will notify the mesh
                        mesh.SendCommand(notification); // no sessionid or userid specified, notification will go to the entire mesh
                        response = "ok";
                    }
                    break;
                }
                case 'cpuinfo': { // Return system information
                    // CPU & memory utilization
                    pr = require('sysinfo').cpuUtilization();
                    pr.sessionid = sessionid;
                    pr.then(function (data) {
                        sendConsoleText(JSON.stringify({ cpu: data, memory: require('sysinfo').memUtilization() }, null, 1), this.sessionid);
                    }, function (e) {
                        sendConsoleText(e);
                    });
                    break;
                }
                case 'sysinfo': { // Return system information
                    getSystemInformation(function (results, err) {
                        if (results == null) { sendConsoleText(err, this.sessionid); } else {
                            sendConsoleText(JSON.stringify(results, null, 1), this.sessionid);
                        }
                    });
                    break;
                }
                case 'info': { // Return information about the agent and agent core module
                    response = 'Current Core: ' +  meshCoreObj.value + '\r\nAgent Time: ' + Date() + '.\r\nUser Rights: 0x' + rights.toString(16) + '.\r\nPlatform: ' + process.platform + '.\r\nCapabilities: ' + meshCoreObj.caps + '.\r\nServer URL: ' + mesh.ServerUrl + '.';
                    if (amt != null) { response += '\r\nBuilt-in LMS: ' + ['Disabled', 'Connecting..', 'Connected'][amt.lmsstate] + '.'; }
                    if (meshCoreObj.osdesc) { response += '\r\nOS: ' + meshCoreObj.osdesc + '.'; }
                    response += '\r\nModules: ' + addedModules.join(', ') + '.';
                    response += '\r\nServer Connection: ' + mesh.isControlChannelConnected + ', State: ' + meshServerConnectionState + '.';
                    var oldNodeId = db.Get('OldNodeId');
                    if (oldNodeId != null) { response += '\r\nOldNodeID: ' + oldNodeId + '.'; }
                    if (process.platform == 'linux' || process.platform == 'freebsd') { response += '\r\nX11 support: ' + require('monitor-info').kvm_x11_support + '.'; }
                    break;
                }
                case 'osinfo': { // Return the operating system information
                    var i = 1;
                    if (args['_'].length > 0) { i = parseInt(args['_'][0]); if (i > 8) { i = 8; } response = 'Calling ' + i + ' times.'; }
                    for (var j = 0; j < i; j++) {
                        var pr = require('os').name();
                        pr.sessionid = sessionid;
                        pr.then(function (v) {
                            sendConsoleText("OS: " + v + (process.platform == 'win32' ? (require('win-virtual-terminal').supported ? ' [ConPTY: YES]' : ' [ConPTY: NO]') : ''), this.sessionid);
                        });
                    }
                    break;
                }
                case 'args': { // Displays parsed command arguments
                    response = 'args ' + objToString(args, 0, ' ', true);
                    break;
                }
                case 'print': { // Print a message on the mesh agent console, does nothing when running in the background
                    var r = [];
                    for (var i in args['_']) { r.push(args['_'][i]); }
                    console.log(r.join(' '));
                    response = 'Message printed on agent console.';
                    break;
                }
                case 'type': { // Returns the content of a file
                    if (args['_'].length == 0) {
                        response = 'Proper usage: type (filepath) [maxlength]'; // Display correct command usage
                    } else {
                        var max = 4096;
                        if ((args['_'].length > 1) && (typeof args['_'][1] == 'number')) { max = args['_'][1]; }
                        if (max > 4096) max = 4096;
                        var buf = Buffer.alloc(max), fd = fs.openSync(args['_'][0], "r"), r = fs.readSync(fd, buf, 0, max); // Read the file content
                        response = buf.toString();
                        var i = response.indexOf('\n');
                        if ((i > 0) && (response[i - 1] != '\r')) { response = response.split('\n').join('\r\n'); }
                        if (r == max) response += '...';
                        fs.closeSync(fd);
                    }
                    break;
                }
                case 'dbkeys': { // Return all data store keys
                    response = JSON.stringify(db.Keys);
                    break;
                }
                case 'dbget': { // Return the data store value for a given key
                    if (db == null) { response = 'Database not accessible.'; break; }
                    if (args['_'].length != 1) {
                        response = 'Proper usage: dbget (key)'; // Display the value for a given database key
                    } else {
                        response = db.Get(args['_'][0]);
                    }
                    break;
                }
                case 'dbset': { // Set a data store key and value pair
                    if (db == null) { response = 'Database not accessible.'; break; }
                    if (args['_'].length != 2) {
                        response = 'Proper usage: dbset (key) (value)'; // Set a database key
                    } else {
                        var r = db.Put(args['_'][0], args['_'][1]);
                        response = 'Key set: ' + r;
                    }
                    break;
                }
                case 'dbcompact': { // Compact the data store
                    if (db == null) { response = 'Database not accessible.'; break; }
                    var r = db.Compact();
                    response = 'Database compacted: ' + r;
                    break;
                }
                case 'httpget': {
                    if (consoleHttpRequest != null) {
                        response = 'HTTP operation already in progress.';
                    } else {
                        if (args['_'].length != 1) {
                            response = 'Proper usage: httpget (url)';
                        } else {
                            var options = http.parseUri(args['_'][0]);
                            options.method = 'GET';
                            if (options == null) {
                                response = 'Invalid url.';
                            } else {
                                try { consoleHttpRequest = http.request(options, consoleHttpResponse); } catch (e) { response = 'Invalid HTTP GET request'; }
                                consoleHttpRequest.sessionid = sessionid;
                                if (consoleHttpRequest != null) {
                                    consoleHttpRequest.end();
                                    response = 'HTTPGET ' + options.protocol + '//' + options.host + ':' + options.port + options.path;
                                }
                            }
                        }
                    }
                    break;
                }
                case 'wslist': { // List all web sockets
                    response = '';
                    for (var i in consoleWebSockets) {
                        var httprequest = consoleWebSockets[i];
                        response += 'Websocket #' + i + ', ' + httprequest.url + '\r\n';
                    }
                    if (response == '') { response = 'no websocket sessions.'; }
                    break;
                }
                case 'wsconnect': { // Setup a web socket
                    if (args['_'].length == 0) {
                        response = 'Proper usage: wsconnect (url)\r\nFor example: wsconnect wss://localhost:443/meshrelay.ashx?id=abc'; // Display correct command usage
                    } else {
                        var httprequest = null;
                        try {
                            var options = http.parseUri(args['_'][0].split('$').join('%24').split('@').join('%40')); // Escape the $ and @ characters in the URL
                            options.rejectUnauthorized = 0;
                            httprequest = http.request(options);
                        } catch (e) { response = 'Invalid HTTP websocket request'; }
                        if (httprequest != null) {
                            httprequest.upgrade = onWebSocketUpgrade;
                            httprequest.on('error', function (e) { sendConsoleText("ERROR: Unable to connect to: " + this.url + ", " + JSON.stringify(e)); });

                            var index = 1;
                            while (consoleWebSockets[index]) { index++; }
                            httprequest.sessionid = sessionid;
                            httprequest.index = index;
                            httprequest.url = args['_'][0];
                            consoleWebSockets[index] = httprequest;
                            response = 'New websocket session #' + index;
                        }
                    }
                    break;
                }
                case 'wssend': { // Send data on a web socket
                    if (args['_'].length == 0) {
                        response = 'Proper usage: wssend (socketnumber)\r\n'; // Display correct command usage
                        for (var i in consoleWebSockets) {
                            var httprequest = consoleWebSockets[i];
                            response += 'Websocket #' + i + ', ' + httprequest.url + '\r\n';
                        }
                    } else {
                        var i = parseInt(args['_'][0]);
                        var httprequest = consoleWebSockets[i];
                        if (httprequest != undefined) {
                            httprequest.s.write(args['_'][1]);
                            response = 'ok';
                        } else {
                            response = 'Invalid web socket number';
                        }
                    }
                    break;
                }
                case 'wsclose': { // Close a websocket
                    if (args['_'].length == 0) {
                        response = 'Proper usage: wsclose (socketnumber)'; // Display correct command usage
                    } else {
                        var i = parseInt(args['_'][0]);
                        var httprequest = consoleWebSockets[i];
                        if (httprequest != undefined) {
                            if (httprequest.s != null) { httprequest.s.end(); } else { httprequest.end(); }
                            response = 'ok';
                        } else {
                            response = 'Invalid web socket number';
                        }
                    }
                    break;
                }
                case 'tunnels': { // Show the list of current tunnels
                    response = '';
                    for (var i in tunnels) { response += 'Tunnel #' + i + ', ' + tunnels[i].url + '\r\n'; }
                    if (response == '') { response = 'No websocket sessions.'; }
                    break;
                }
                case 'ls': { // Show list of files and folders
                    response = '';
                    var xpath = '*';
                    if (args['_'].length > 0) { xpath = obj.path.join(args['_'][0], '*'); }
                    response = 'List of ' + xpath + '\r\n';
                    var results = fs.readdirSync(xpath);
                    for (var i = 0; i < results.length; ++i) {
                        var stat = null, p = obj.path.join(args['_'][0], results[i]);
                        try { stat = fs.statSync(p); } catch (e) { }
                        if ((stat == null) || (stat == undefined)) {
                            response += (results[i] + "\r\n");
                        } else {
                            response += (results[i] + " " + ((stat.isDirectory()) ? "(Folder)" : "(File)") + "\r\n");
                        }
                    }
                    break;
                }
                case 'lsx': { // Show list of files and folders
                    response = objToString(getDirectoryInfo(args['_'][0]), 0, ' ', true);
                    break;
                }
                case 'lock': { // Lock the current user out of the desktop
                    if (process.platform == 'win32') { var child = require('child_process'); child.execFile(process.env['windir'] + '\\system32\\cmd.exe', ['/c', 'RunDll32.exe user32.dll,LockWorkStation'], { type: 1 }); response = 'Ok'; }
                    else { response = 'Not supported on the platform'; }
                    break;
                }
                case 'amt': { // Show Intel AMT status
                    if (amt != null) {
                        amt.getMeiState(9, function (state) {
                            var resp = "Intel AMT not detected.";
                            if (state != null) { resp = objToString(state, 0, ' ', true); }
                            sendConsoleText(resp, sessionid);
                        });
                    } else {
                        response = "Intel AMT not detected.";
                    }
                    break;
                }
                case 'netinfo': { // Show network interface information
                    var interfaces = require('os').networkInterfaces();
                    response = objToString(interfaces, 0, ' ', true);
                    break;
                }
                case 'wakeonlan': { // Send wake-on-lan
                    if ((args['_'].length != 1) || (args['_'][0].length != 12)) {
                        response = 'Proper usage: wakeonlan [mac], for example "wakeonlan 010203040506".';
                    } else {
                        var count = sendWakeOnLan(args['_'][0]);
                        response = 'Sent wake-on-lan on ' + count + ' interface(s).';
                    }
                    break;
                }
                case 'sendall': { // Send a message to all consoles on this mesh
                    sendConsoleText(args['_'].join(' '));
                    break;
                }
                case 'power': { // Execute a power action on this computer
                    if (mesh.ExecPowerState == undefined) {
                        response = 'Power command not supported on this agent.';
                    } else {
                        if ((args['_'].length == 0) || isNaN(Number(args['_'][0]))) {
                            response = 'Proper usage: power (actionNumber), where actionNumber is:\r\n  LOGOFF = 1\r\n  SHUTDOWN = 2\r\n  REBOOT = 3\r\n  SLEEP = 4\r\n  HIBERNATE = 5\r\n  DISPLAYON = 6\r\n  KEEPAWAKE = 7\r\n  BEEP = 8\r\n  CTRLALTDEL = 9\r\n  VIBRATE = 13\r\n  FLASH = 14'; // Display correct command usage
                        } else {
                            var r = mesh.ExecPowerState(Number(args['_'][0]), Number(args['_'][1]));
                            response = 'Power action executed with return code: ' + r + '.';
                        }
                    }
                    break;
                }
                case 'location': {
                    getIpLocationData(function (location) {
                        sendConsoleText(objToString({ action: 'iplocation', type: 'publicip', value: location }, 0, ' '));
                    });
                    break;
                }
                case 'parseuri': {
                    response = JSON.stringify(http.parseUri(args['_'][0]));
                    break;
                }
                case 'scanwifi': {
                    if (wifiScanner != null) {
                        var wifiPresent = wifiScanner.hasWireless;
                        if (wifiPresent) { response = "Perfoming Wifi scan..."; wifiScanner.Scan(); } else { response = "Wifi absent."; }
                    } else { response = "Wifi module not present."; }
                    break;
                }
                case 'modules': {
                    response = JSON.stringify(addedModules);
                    break;
                }
                case 'listservices': {
                    var services = require('service-manager').manager.enumerateService();
                    response = JSON.stringify(services, null, 1);
                    break;
                }
                case 'getscript': {
                    if (args['_'].length != 1) {
                        response = "Proper usage: getscript [scriptNumber].";
                    } else {
                        mesh.SendCommand({ action: 'getScript', type: args['_'][0] });
                    }
                    break;
                }
                case 'diagnostic':
                    {
                        if (!mesh.DAIPC.listening) {
                            response = 'Unable to bind to Diagnostic IPC, most likely because the path (' + process.cwd() + ') is not on a local file system';
                            break;
                        }
                        var diag = diagnosticAgent_installCheck();
                        if (diag) {
                            if (args['_'].length == 1 && args['_'][0] == 'uninstall') {
                                diagnosticAgent_uninstall();
                                response = 'Diagnostic Agent uninstalled';
                            }
                            else {
                                response = 'Diagnostic Agent installed at: ' + diag.appLocation();
                            }
                        }
                        else {
                            if (args['_'].length == 1 && args['_'][0] == 'install') {
                                diag = diagnosticAgent_installCheck(true);
                                if (diag) {
                                    response = 'Diagnostic agent was installed at: ' + diag.appLocation();
                                }
                                else {
                                    response = 'Diagnostic agent installation failed';
                                }
                            }
                            else {
                                response = 'Diagnostic Agent Not installed. To install: diagnostic install';
                            }
                        }
                        if (diag) { diag.close(); diag = null; }
                        break;
                    }
                case 'amtevents': {
                    if (obj.amtevents == null) { response = 'No events.'; } else { response = obj.amtevents.join('\r\n'); }
                    break;
                }
                case 'amtconfig': {
                    if (amt == null) { response = "Intel AMT not detected."; break; }
                    if (apftunnel != null) { response = "Intel AMT server tunnel already active"; break; }
                    amt.getMeiState(15, function (state) {
                        var rx = '';
                        if ((state == null) || (state.ProvisioningState == null)) { rx = "Intel AMT not ready for configuration."; } else {
                            var apfarg = {
                                mpsurl: mesh.ServerUrl.replace('agent.ashx', 'apf.ashx'),
                                mpsuser: Buffer.from(mesh.ServerInfo.MeshID, 'hex').toString('base64').substring(0, 16),
                                mpspass: Buffer.from(mesh.ServerInfo.MeshID, 'hex').toString('base64').substring(0, 16),
                                mpskeepalive: 60000,
                                clientname: state.OsHostname,
                                clientaddress: '127.0.0.1',
                                clientuuid: state.UUID,
                                conntype: 2, // 0 = CIRA, 1 = Relay, 2 = LMS. The correct value is 2 since we are performing an LMS relay, other values for testing.
                                meiState: state // MEI state will be passed to MPS server
                            };
                            if ((state.UUID == null) || (state.UUID.length != 36)) {
                                rx = "Unable to get Intel AMT UUID";
                            } else {
                                addAmtEvent('User LMS tunnel start.');
                                apftunnel = require('amt-apfclient')({ debug: false }, apfarg);
                                apftunnel.onJsonControl = function (data) {
                                    if (data.action == 'console') { addAmtEvent(data.msg); require('MeshAgent').SendCommand({ action: 'msg', type: 'console', value: data.msg }); } // Display a console message
                                    if (data.action == 'mestate') { amt.getMeiState(15, function (state) { apftunnel.updateMeiState(state); }); } // Update the MEI state
                                    if (data.action == 'deactivate') { // Request CCM deactivation
                                        var amtMeiModule, amtMei;
                                        try { amtMeiModule = require('amt-mei'); amtMei = new amtMeiModule(); } catch (ex) { apftunnel.sendMeiDeactivationState(1); return; }
                                        amtMei.on('error', function (e) { apftunnel.sendMeiDeactivationState(1); });
                                        amtMei.unprovision(1, function (status) { apftunnel.sendMeiDeactivationState(status); }); // 0 = Success
                                    }
                                    if (data.action == 'close') { try { apftunnel.disconnect(); } catch (e) { } apftunnel = null; } // Close the CIRA-LMS connection
                                }
                                apftunnel.onChannelClosed = function () { addAmtEvent('User LMS tunnel closed.'); apftunnel = null; }
                                try {
                                    apftunnel.connect();
                                    rx = "Started Intel AMT configuration";
                                } catch (ex) {
                                    rx = JSON.stringify(ex);
                                }
                            }
                        }
                        if (rx != '') { require('MeshAgent').SendCommand({ action: 'msg', type: 'console', value: rx }); }
                    });
                    break;
                }
                case 'apf': {
                    if (meshCoreObj.intelamt !== null) {
                        if (args['_'].length == 1) {
                            var connType = -1, connTypeStr = args['_'][0].toLowerCase();
                            if (connTypeStr == 'lms') { connType = 2; }
                            if (connTypeStr == 'relay') { connType = 1; }
                            if (connTypeStr == 'cira') { connType = 0; }
                            if (connTypeStr == 'off') { connType = -2; }
                            if (connType >= 0) { // Connect
                                var apfarg = {
                                    mpsurl: mesh.ServerUrl.replace('agent.ashx', 'apf.ashx'),
                                    mpsuser: Buffer.from(mesh.ServerInfo.MeshID, 'hex').toString('base64').substring(0, 16),
                                    mpspass: Buffer.from(mesh.ServerInfo.MeshID, 'hex').toString('base64').substring(0, 16),
                                    mpskeepalive: 60000,
                                    clientname: require('os').hostname(),
                                    clientaddress: '127.0.0.1',
                                    clientuuid: meshCoreObj.intelamt.uuid,
                                    conntype: connType // 0 = CIRA, 1 = Relay, 2 = LMS. The correct value is 2 since we are performing an LMS relay, other values for testing.
                                };
                                if ((apfarg.clientuuid == null) || (apfarg.clientuuid.length != 36)) {
                                    response = "Unable to get Intel AMT UUID: " + apfarg.clientuuid;
                                } else {
                                    apftunnel = require('amt-apfclient')({ debug: false }, apfarg);
                                    apftunnel.onJsonControl = function (data) {
                                        if (data.action == 'console') { require('MeshAgent').SendCommand({ action: 'msg', type: 'console', value: data.msg }); }
                                        if (data.action == 'close') { try { apftunnel.disconnect(); } catch (e) { } apftunnel = null; }
                                    }
                                    apftunnel.onChannelClosed = function () { apftunnel = null; }
                                    try {
                                        apftunnel.connect();
                                        response = "Started APF tunnel";
                                    } catch (e) {
                                        response = JSON.stringify(e);
                                    }
                                }
                            } else if (connType == -2) { // Disconnect
                                try {
                                    apftunnel.disconnect();
                                    response = "Stopped APF tunnel";
                                } catch (e) {
                                    response = JSON.stringify(e);
                                }
                                apftunnel = null;
                            } else {
                                response = "Invalid command.\r\nUse: apf lms|relay|cira|off";
                            }
                        } else {
                            response = "APF tunnel is " + (apftunnel == null ? "off" : "on") + "\r\nUse: apf lms|relay|cira|off";
                        }
                    } else {
                        response = "APF tunnel requires Intel AMT";
                    }
                    break;
                }
                case 'plugin': {
                    if (typeof args['_'][0] == 'string') {
                        try {
                            // Pass off the action to the plugin
                            // for plugin creators, you'll want to have a plugindir/modules_meshcore/plugin.js
                            // to control the output / actions here.
                            response = require(args['_'][0]).consoleaction(args, rights, sessionid, mesh);
                        } catch (e) {
                            response = "There was an error in the plugin (" + e + ")";
                        }
                    } else {
                        response = "Proper usage: plugin [pluginName] [args].";
                    }
                    break;
                }
                default: { // This is an unknown command, return an error message
                    response = "Unknown command \"" + cmd + "\", type \"help\" for list of avaialble commands.";
                    break;
                }
            }
        } catch (e) { response = "Command returned an exception error: " + e; console.log(e); }
        if (response != null) { sendConsoleText(response, sessionid); }
    }

    // Send a mesh agent console command
    function sendConsoleText(text, sessionid) {
        if (typeof text == 'object') { text = JSON.stringify(text); }
        require('MeshAgent').SendCommand({ action: 'msg', type: 'console', value: text, sessionid: sessionid });
    }

    // Called before the process exits
    //process.exit = function (code) { console.log("Exit with code: " + code.toString()); }

    // Called when the server connection state changes
    function handleServerConnection(state) {
        meshServerConnectionState = state;
        if (meshServerConnectionState == 0) {
            // Server disconnected
            if (selfInfoUpdateTimer != null) { clearInterval(selfInfoUpdateTimer); selfInfoUpdateTimer = null; }
            lastSelfInfo = null;
        } else {
            // Server connected, send mesh core information
            var oldNodeId = db.Get('OldNodeId');
            if (oldNodeId != null) { mesh.SendCommand({ action: 'mc1migration', oldnodeid: oldNodeId }); }

            // Send SMBios tables if present
            if (SMBiosTablesRaw != null) { mesh.SendCommand({ action: 'smbios', value: SMBiosTablesRaw }); }

            // Update the server on with basic info, logged in users and more advanced stuff, like Intel ME and Network Settings
            meInfoStr = null;
            sendPeriodicServerUpdate(null, true);
            if (selfInfoUpdateTimer == null) { selfInfoUpdateTimer = setInterval(sendPeriodicServerUpdate, 1200000); } // 20 minutes

            // Send any state messages
            if (Object.keys(tunnelUserCount.msg).length > 0) {
                try { mesh.SendCommand({ action: 'sessions', type: 'msg', value: tunnelUserCount.msg }); } catch (e) { }
                broadcastSessionsToRegisteredApps();
            }

            // Send update of registered applications to the server
            updateRegisteredAppsToServer();
        }

        // Send server state update to registered applications
        broadcastToRegisteredApps({ cmd: 'serverstate', value: meshServerConnectionState, url: require('MeshAgent').ConnectedServer });
    }

    // Update the server with the latest network interface information
    var sendNetworkUpdateNagleTimer = null;
    function sendNetworkUpdateNagle() { if (sendNetworkUpdateNagleTimer != null) { clearTimeout(sendNetworkUpdateNagleTimer); sendNetworkUpdateNagleTimer = null; } sendNetworkUpdateNagleTimer = setTimeout(sendNetworkUpdate, 5000); }
    function sendNetworkUpdate(force) {
        sendNetworkUpdateNagleTimer = null;

        // Update the network interfaces information data
        var netInfo = { netif2: require('os').networkInterfaces() };
        if (netInfo.netif2) {
            netInfo.action = 'netinfo';
            var netInfoStr = JSON.stringify(netInfo);
            if ((force == true) || (clearGatewayMac(netInfoStr) != clearGatewayMac(lastNetworkInfo))) { mesh.SendCommand(netInfo); lastNetworkInfo = netInfoStr; }
        }
    }

    // Called periodically to check if we need to send updates to the server
    function sendPeriodicServerUpdate(flags, force) {
        if (meshServerConnectionState == 0) return; // Not connected to server, do nothing.
        if (!flags) { flags = 0xFFFFFFFF; }

        // If we have a connected MEI, get Intel ME information
        if ((flags & 1) && (amt != null) && (amt.state == 2)) {
            delete meshCoreObj.intelamt;
            amt.getMeiState(9, function (meinfo) {
                meshCoreObj.intelamt = meinfo;
                meshCoreObj.intelamt.microlms = amt.lmsstate;
                meshCoreObjChanged();
            });
        }

        // Update network information
        if (flags & 2) { sendNetworkUpdateNagle(false); }

        // Update anti-virus information
        if ((flags & 4) && (process.platform == 'win32')) {
            // Windows Command: "wmic /Namespace:\\root\SecurityCenter2 Path AntiVirusProduct get /FORMAT:CSV"
            try { meshCoreObj.av = require('win-info').av(); meshCoreObjChanged(); } catch (e) { av = null; } // Antivirus
            //if (process.platform == 'win32') { try { meshCoreObj.pr = require('win-info').pendingReboot(); meshCoreObjChanged(); } catch (e) { meshCoreObj.pr = null; } } // Pending reboot
        }

        // Send available data right now
        if (force) {
            meshCoreObj = sortObjRec(meshCoreObj);
            var x = JSON.stringify(meshCoreObj);
            if (x != LastPeriodicServerUpdate) {
                LastPeriodicServerUpdate = x;
                mesh.SendCommand(meshCoreObj);
            }
        }
    }

    // Once we are done collecting all the data, send to server if needed
    var LastPeriodicServerUpdate = null;
    var PeriodicServerUpdateNagleTimer = null;
    function meshCoreObjChanged() { if (PeriodicServerUpdateNagleTimer == null) { PeriodicServerUpdateNagleTimer = setTimeout(meshCoreObjChangedEx, 500); } }
    function meshCoreObjChangedEx() {
        PeriodicServerUpdateNagleTimer = null;
        meshCoreObj = sortObjRec(meshCoreObj);
        var x = JSON.stringify(meshCoreObj);
        if (x != LastPeriodicServerUpdate) {
            try { LastPeriodicServerUpdate = x; mesh.SendCommand(meshCoreObj); } catch (ex) { }
        }
    }

    function sortObjRec(o) { if ((typeof o != 'object') || (Array.isArray(o))) return o; for (var i in o) { if (typeof o[i] == 'object') { o[i] = sortObjRec(o[i]); } } return sortObj(o); }
    function sortObj(o) { return Object.keys(o).sort().reduce(function (result, key) { result[key] = o[key]; return result; }, {}); }

    // Starting function
    obj.start = function () {
        // Setup the mesh agent event handlers
        mesh.AddCommandHandler(handleServerCommand);
        mesh.AddConnectHandler(handleServerConnection);
    }

    obj.stop = function () {
        mesh.AddCommandHandler(null);
        mesh.AddConnectHandler(null);
    }

    function onWebSocketClosed() { sendConsoleText("WebSocket #" + this.httprequest.index + " closed.", this.httprequest.sessionid); delete consoleWebSockets[this.httprequest.index]; }
    function onWebSocketData(data) { sendConsoleText("Got WebSocket #" + this.httprequest.index + " data: " + data, this.httprequest.sessionid); }
    function onWebSocketSendOk() { sendConsoleText("WebSocket #" + this.index + " SendOK.", this.sessionid); }

    function onWebSocketUpgrade(response, s, head) {
        sendConsoleText("WebSocket #" + this.index + " connected.", this.sessionid);
        this.s = s;
        s.httprequest = this;
        s.end = onWebSocketClosed;
        s.data = onWebSocketData;
    }

    return obj;
}

//
// Module startup
//

try {
    var xexports = null, mainMeshCore = null;
    try { xexports = module.exports; } catch (e) { }

    if (xexports != null) {
        // If we are running within NodeJS, export the core
        module.exports.createMeshCore = createMeshCore;
    } else {
        // If we are not running in NodeJS, launch the core
        mainMeshCore = createMeshCore();
        mainMeshCore.start(null);
    }
} catch (e) {
    require('MeshAgent').SendCommand({ action: 'msg', type: 'console', value: "uncaughtException2: " + ex });
}
