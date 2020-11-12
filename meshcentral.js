/**
* @description MeshCentral main module
* @author Ylian Saint-Hilaire
* @copyright Intel Corporation 2018-2020
* @license Apache-2.0
* @version v0.0.1
*/

/*xjslint node: true */
/*xjslint plusplus: true */
/*xjslint maxlen: 256 */
/*jshint node: true */
/*jshint strict: false */
/*jshint esversion: 6 */
"use strict";

// If running NodeJS less than version 8, try to polyfill promisify
try { if (Number(process.version.match(/^v(\d+\.\d+)/)[1]) < 8) { require('util.promisify').shim(); } } catch (ex) { }

// If app metrics is available
if (process.argv[2] == '--launch') { try { require('appmetrics-dash').monitor({ url: '/', title: 'MeshCentral', port: 88, host: '127.0.0.1' }); } catch (e) { } }

function CreateMeshCentralServer(config, args) {
    var obj = {};
    obj.db = null;
    obj.webserver = null;
    obj.redirserver = null;
    obj.mpsserver = null;
    obj.mqttbroker = null;
    obj.swarmserver = null;
    obj.mailserver = null;
    obj.smsserver = null;
    obj.amtEventHandler = null;
    obj.pluginHandler = null;
    obj.amtScanner = null;
    obj.amtManager = null;
    obj.meshScanner = null;
    obj.letsencrypt = null;
    obj.eventsDispatch = {};
    obj.fs = require('fs');
    obj.path = require('path');
    obj.crypto = require('crypto');
    obj.exeHandler = require('./exeHandler.js');
    obj.platform = require('os').platform();
    obj.args = args;
    obj.common = require('./common.js');
    obj.configurationFiles = null;
    obj.certificates = null;
    obj.connectivityByNode = {};      // This object keeps a list of all connected CIRA and agents, by nodeid->value (value: 1 = Agent, 2 = CIRA, 4 = AmtDirect)
    obj.peerConnectivityByNode = {};  // This object keeps a list of all connected CIRA and agents of peers, by serverid->nodeid->value (value: 1 = Agent, 2 = CIRA, 4 = AmtDirect)
    obj.debugSources = [];
    obj.debugRemoteSources = null;
    obj.config = config;              // Configuration file
    obj.dbconfig = {};                // Persistance values, loaded from database
    obj.certificateOperations = null;
    obj.defaultMeshCmd = null;
    obj.defaultMeshCores = {};
    obj.defaultMeshCoresDeflate = {};
    obj.defaultMeshCoresHash = {};
    obj.meshToolsBinaries = {};       // Mesh Tools Binaries, ToolName --> { hash:(sha384 hash), size:(binary size), path:(binary path) }
    obj.meshAgentBinaries = {};       // Mesh Agent Binaries, Architecture type --> { hash:(sha384 hash), size:(binary size), path:(binary path) }
    obj.meshAgentInstallScripts = {}; // Mesh Install Scripts, Script ID -- { hash:(sha384 hash), size:(binary size), path:(binary path) }
    obj.multiServer = null;
    obj.maintenanceTimer = null;
    obj.serverId = null;
    obj.serverKey = Buffer.from(obj.crypto.randomBytes(48), 'binary');
    obj.loginCookieEncryptionKey = null;
    obj.invitationLinkEncryptionKey = null;
    obj.serverSelfWriteAllowed = true;
    obj.serverStatsCounter = Math.floor(Math.random() * 1000);
    obj.taskLimiter = obj.common.createTaskLimiterQueue(50, 20, 60); // (maxTasks, maxTaskTime, cleaningInterval) This is a task limiter queue to smooth out server work.
    obj.agentUpdateBlockSize = 65531; // MeshAgent update block size
    obj.serverWarnings = []; // List of warnings that should be shown to administrators
    obj.cookieUseOnceTable = {}; // List of cookies that are already expired
    obj.cookieUseOnceTableCleanCounter = 0; // Clean the cookieUseOnceTable each 20 additions
    obj.firstStats = true; // True until this server saves it's not stats to the database

    // Server version
    obj.currentVer = null;
    function getCurrentVerion() { try { obj.currentVer = JSON.parse(obj.fs.readFileSync(obj.path.join(__dirname, 'package.json'), 'utf8')).version; } catch (e) { } return obj.currentVer; } // Fetch server version
    getCurrentVerion();

    // Setup the default configuration and files paths
    if ((__dirname.endsWith('/node_modules/meshcentral')) || (__dirname.endsWith('\\node_modules\\meshcentral')) || (__dirname.endsWith('/node_modules/meshcentral/')) || (__dirname.endsWith('\\node_modules\\meshcentral\\'))) {
        obj.parentpath = obj.path.join(__dirname, '../..');
        obj.datapath = obj.path.join(__dirname, '../../meshcentral-data');
        obj.filespath = obj.path.join(__dirname, '../../meshcentral-files');
        obj.backuppath = obj.path.join(__dirname, '../../meshcentral-backup');
        obj.recordpath = obj.path.join(__dirname, '../../meshcentral-recordings');
        obj.webViewsPath = obj.path.join(__dirname, 'views');
        obj.webPublicPath = obj.path.join(__dirname, 'public');
        obj.webEmailsPath = obj.path.join(__dirname, 'emails');
        if (obj.fs.existsSync(obj.path.join(__dirname, '../../meshcentral-web/views'))) { obj.webViewsOverridePath = obj.path.join(__dirname, '../../meshcentral-web/views'); }
        if (obj.fs.existsSync(obj.path.join(__dirname, '../../meshcentral-web/public'))) { obj.webPublicOverridePath = obj.path.join(__dirname, '../../meshcentral-web/public'); }
        if (obj.fs.existsSync(obj.path.join(__dirname, '../../meshcentral-web/emails'))) { obj.webEmailsOverridePath = obj.path.join(__dirname, '../../meshcentral-web/emails'); }
    } else {
        obj.parentpath = __dirname;
        obj.datapath = obj.path.join(__dirname, '../meshcentral-data');
        obj.filespath = obj.path.join(__dirname, '../meshcentral-files');
        obj.backuppath = obj.path.join(__dirname, '../meshcentral-backups');
        obj.recordpath = obj.path.join(__dirname, '../meshcentral-recordings');
        obj.webViewsPath = obj.path.join(__dirname, 'views');
        obj.webPublicPath = obj.path.join(__dirname, 'public');
        obj.webEmailsPath = obj.path.join(__dirname, 'emails');
        if (obj.fs.existsSync(obj.path.join(__dirname, '../meshcentral-web/views'))) { obj.webViewsOverridePath = obj.path.join(__dirname, '../meshcentral-web/views'); }
        if (obj.fs.existsSync(obj.path.join(__dirname, '../meshcentral-web/public'))) { obj.webPublicOverridePath = obj.path.join(__dirname, '../meshcentral-web/public'); }
        if (obj.fs.existsSync(obj.path.join(__dirname, '../meshcentral-web/emails'))) { obj.webEmailsOverridePath = obj.path.join(__dirname, '../meshcentral-web/emails'); }
    }

    // Clean up any temporary files
    var removeTime = new Date(Date.now()).getTime() - (30 * 60 * 1000); // 30 minutes
    var dir = obj.fs.readdir(obj.path.join(obj.filespath, 'tmp'), function (err, files) {
        if (err != null) return;
        for (var i in files) { try { const filepath = obj.path.join(obj.filespath, 'tmp', files[i]); if (obj.fs.statSync(filepath).mtime.getTime() < removeTime) { obj.fs.unlink(filepath, function () { }); } } catch (ex) { } }
    });

    // Look to see if data and/or file path is specified
    if (obj.config.settings && (typeof obj.config.settings.datapath == 'string')) { obj.datapath = obj.config.settings.datapath; }
    if (obj.config.settings && (typeof obj.config.settings.filespath == 'string')) { obj.filespath = obj.config.settings.filespath; }

    // Create data and files folders if needed
    try { obj.fs.mkdirSync(obj.datapath); } catch (e) { }
    try { obj.fs.mkdirSync(obj.filespath); } catch (e) { }

    // Windows Specific Code, setup service and event log
    obj.service = null;
    obj.servicelog = null;
    if (obj.platform == 'win32') {
        var nodewindows = require('node-windows');
        obj.service = nodewindows.Service;
        var eventlogger = nodewindows.EventLogger;
        obj.servicelog = new eventlogger('MeshCentral');
    }

    // Start the Meshcentral server
    obj.Start = function () {
        var i;
        try { require('./pass').hash('test', function () { }, 0); } catch (e) { console.log('Old version of node, must upgrade.'); return; } // TODO: Not sure if this test works or not.

        // Check for invalid arguments
        var validArguments = ['_', 'user', 'port', 'aliasport', 'mpsport', 'mpsaliasport', 'redirport', 'rediraliasport', 'cert', 'mpscert', 'deletedomain', 'deletedefaultdomain', 'showall', 'showusers', 'showitem', 'listuserids', 'showusergroups', 'shownodes', 'showallmeshes', 'showmeshes', 'showevents', 'showsmbios', 'showpower', 'clearpower', 'showiplocations', 'help', 'exactports', 'xinstall', 'xuninstall', 'install', 'uninstall', 'start', 'stop', 'restart', 'debug', 'filespath', 'datapath', 'noagentupdate', 'launch', 'noserverbackup', 'mongodb', 'mongodbcol', 'wanonly', 'lanonly', 'nousers', 'mpspass', 'ciralocalfqdn', 'dbexport', 'dbexportmin', 'dbimport', 'dbmerge', 'dbfix', 'dbencryptkey', 'selfupdate', 'tlsoffload', 'userallowedip', 'userblockedip', 'swarmallowedip', 'agentallowedip', 'agentblockedip', 'fastcert', 'swarmport', 'logintoken', 'logintokenkey', 'logintokengen', 'mailtokengen', 'admin', 'unadmin', 'sessionkey', 'sessiontime', 'minify', 'minifycore', 'dblistconfigfiles', 'dbshowconfigfile', 'dbpushconfigfiles', 'dbpullconfigfiles', 'dbdeleteconfigfiles', 'vaultpushconfigfiles', 'vaultpullconfigfiles', 'vaultdeleteconfigfiles', 'configkey', 'loadconfigfromdb', 'npmpath', 'serverid', 'recordencryptionrecode', 'vault', 'token', 'unsealkey', 'name', 'log', 'dbstats', 'translate', 'createaccount', 'resetaccount', 'pass', 'adminaccount', 'removeaccount', 'domain', 'email'];
        for (var arg in obj.args) { obj.args[arg.toLocaleLowerCase()] = obj.args[arg]; if (validArguments.indexOf(arg.toLocaleLowerCase()) == -1) { console.log('Invalid argument "' + arg + '", use --help.'); return; } }
        if (obj.args.mongodb == true) { console.log('Must specify: --mongodb [connectionstring] \r\nSee https://docs.mongodb.com/manual/reference/connection-string/ for MongoDB connection string.'); return; }
        for (i in obj.config.settings) { obj.args[i] = obj.config.settings[i]; } // Place all settings into arguments, arguments have already been placed into settings so arguments take precedence.

        if ((obj.args.help == true) || (obj.args['?'] == true)) {
            console.log('MeshCentral v' + getCurrentVerion() + ', remote computer management web portal.');
            console.log('This software is open source under Apache 2.0 license.');
            console.log('Details at: https://www.meshcommander.com/meshcentral2\r\n');
            if ((obj.platform == 'win32') || (obj.platform == 'linux')) {
                console.log('Run as a background service');
                console.log('   --install/uninstall               Install MeshCentral as a background service.');
                console.log('   --start/stop/restart              Control MeshCentral background service.');
                console.log('');
                console.log('Run standalone, console application');
            }
            console.log('   --user [username]                 Always login as [username] if account exists.');
            console.log('   --port [number]                   Web server port number.');
            console.log('   --redirport [number]              Creates an additional HTTP server to redirect users to the HTTPS server.');
            console.log('   --exactports                      Server must run with correct ports or exit.');
            console.log('   --noagentupdate                   Server will not update mesh agent native binaries.');
            console.log('   --listuserids                     Show a list of a user identifiers in the database.');
            console.log('   --cert [name], (country), (org)   Create a web server certificate with [name] server name.');
            console.log('                                     country and organization can optionally be set.');
            console.log('');
            console.log('Server recovery commands, use only when MeshCentral is offline.');
            console.log('   --createaccount [userid]          Create a new user account.');
            console.log('   --resetaccount [userid]           Unlock an account, disable 2FA and set a new account password.');
            console.log('   --adminaccount [userid]           Promote account to site administrator.');
            console.log('   --removeaccount [userid]          Remove a user account.');
            return;
        }

        // Fix a NeDB database
        if (obj.args.dbfix) {
            var lines = null, badJsonCount = 0, feildNames = [], fixedDb = [];
            try { lines = obj.fs.readFileSync(obj.getConfigFilePath(obj.args.dbfix), { encoding: 'utf8' }).split('\n'); } catch (e) { console.log('Invalid file: ' + obj.args.dbfix + ': ' + e); process.exit(); }
            for (var i = 0; i < lines.length; i++) {
                var x = null;
                try { x = JSON.parse(lines[i]); } catch (ex) { badJsonCount++; }
                if (x != null) { fixedDb.push(lines[i]); for (var j in x) { if (feildNames.indexOf(j) == -1) { feildNames.push(j); } } }
            }
            console.log('Lines: ' + lines.length + ', badJSON: ' + badJsonCount + ', Feilds: ' + feildNames);
            obj.fs.writeFileSync(obj.getConfigFilePath(obj.args.dbfix) + '-fixed', fixedDb.join('\n'), { encoding: 'utf8' });
            return;
        }

        // Perform web site translations into different languages
        if (obj.args.translate) {
            // Check NodeJS version
            const NodeJSVer = Number(process.version.match(/^v(\d+\.\d+)/)[1]);
            if (NodeJSVer < 8) { console.log("Translation feature requires Node v8 or above, current version is " + process.version + "."); process.exit(); return; }

            // Check if translate.json is in the "meshcentral-data" folder, if so use that and translate default pages.
            var translationFile = null, customTranslation = false;
            if (require('fs').existsSync(obj.path.join(obj.datapath, 'translate.json'))) { translationFile = obj.path.join(obj.datapath, 'translate.json'); console.log("Using translate.json in meshentral-data."); customTranslation = true; }
            if (translationFile == null) { if (require('fs').existsSync(obj.path.join(__dirname, 'translate', 'translate.json'))) { translationFile = obj.path.join(__dirname, 'translate', 'translate.json'); console.log("Using default translate.json."); } }
            if (translationFile == null) { console.log("Unable to find translate.json."); process.exit(); return; }

            // Perform translation operations
            var didSomething = false;
            process.chdir(obj.path.join(__dirname, 'translate'));
            var translateEngine = require('./translate/translate.js')
            if (customTranslation == true) {
                // Translate all of the default files using custom translation file
                translateEngine.startEx(['', '', 'minifyall']);
                translateEngine.startEx(['', '', 'translateall', translationFile]);
                translateEngine.startEx(['', '', 'extractall', translationFile]);
                didSomething = true;
            }

            // Check if "meshcentral-web" exists, if so, translate all pages in that folder.
            if (obj.webViewsOverridePath != null) {
                didSomething = true;
                var files = obj.fs.readdirSync(obj.webViewsOverridePath);
                for (var i in files) {
                    var file = obj.path.join(obj.webViewsOverridePath, files[i]);
                    if (file.endsWith('.handlebars') && !file.endsWith('-min.handlebars')) {
                        translateEngine.startEx(['', '', 'minify', file]);
                    }
                }
                files = obj.fs.readdirSync(obj.webViewsOverridePath);
                for (var i in files) {
                    var file = obj.path.join(obj.webViewsOverridePath, files[i]);
                    if (file.endsWith('.handlebars') || file.endsWith('-min.handlebars')) {
                        translateEngine.startEx(['', '', 'translate', '*', translationFile, file, '--subdir:translations']);
                    }
                }
            }
            /*
            if (obj.webPublicOverridePath != null) {
                didSomething = true;
                var files = obj.fs.readdirSync(obj.webPublicOverridePath);
                for (var i in files) {
                    var file = obj.path.join(obj.webPublicOverridePath, files[i]);
                    if (file.endsWith('.htm') && !file.endsWith('-min.htm')) {
                        translateEngine.startEx(['', '', 'translate', '*', translationFile, file, '--subdir:translations']);
                    }
                }
            }
            */

            if (didSomething == false) { console.log("Nothing to do."); }
            process.exit();
            return;
        }

        // Setup the Node+NPM path if possible, this makes it possible to update the server even if NodeJS and NPM are not in default paths.
        if (obj.args.npmpath == null) {
            try {
                var nodepath = process.argv[0];
                var npmpath = obj.path.join(obj.path.dirname(process.argv[0]), 'npm');
                if (obj.fs.existsSync(nodepath) && obj.fs.existsSync(npmpath)) {
                    if (nodepath.indexOf(' ') >= 0) { nodepath = '"' + nodepath + '"'; }
                    if (npmpath.indexOf(' ') >= 0) { npmpath = '"' + npmpath + '"'; }
                    if (obj.platform == 'win32') { obj.args.npmpath = npmpath; } else { obj.args.npmpath = (nodepath + ' ' + npmpath); }
                }
            } catch (ex) { }
        }

        // Linux background service systemd handling
        if (obj.platform == 'linux') {
            if (obj.args.install == true) {
                // Install MeshCentral in Systemd
                console.log('Installing MeshCentral as background Service...');
                var userinfo = require('os').userInfo(), systemdConf = null;
                if (require('fs').existsSync('/etc/systemd/system')) { systemdConf = '/etc/systemd/system/meshcentral.service'; }
                else if (require('fs').existsSync('/lib/systemd/system')) { systemdConf = '/lib/systemd/system/meshcentral.service'; }
                else if (require('fs').existsSync('/usr/lib/systemd/system')) { systemdConf = '/usr/lib/systemd/system/meshcentral.service'; }
                else { console.log('Unable to find systemd configuration folder.'); process.exit(); return; }
                console.log('Writing config file...');
                require('child_process').exec('which node', {}, function (error, stdout, stderr) {
                    if ((error != null) || (stdout.indexOf('\n') == -1)) { console.log('ERROR: Unable to get node location: ' + error); process.exit(); return; }
                    var nodePath = stdout.substring(0, stdout.indexOf('\n'));
                    var config = '[Unit]\nDescription=MeshCentral Server\n\n[Service]\nType=simple\nLimitNOFILE=1000000\nExecStart=' + nodePath + ' ' + __dirname + '/meshcentral\nWorkingDirectory=' + userinfo.homedir + '\nEnvironment=NODE_ENV=production\nUser=' + userinfo.username + '\nGroup=' + userinfo.username + '\nRestart=always\n# Restart service after 10 seconds if node service crashes\nRestartSec=10\n# Set port permissions capability\nAmbientCapabilities=cap_net_bind_service\n\n[Install]\nWantedBy=multi-user.target\n';
                    require('child_process').exec('echo \"' + config + '\" | sudo tee ' + systemdConf, {}, function (error, stdout, stderr) {
                        if ((error != null) && (error != '')) { console.log('ERROR: Unable to write config file: ' + error); process.exit(); return; }
                        console.log('Enabling service...');
                        require('child_process').exec('sudo systemctl enable meshcentral.service', {}, function (error, stdout, stderr) {
                            if ((error != null) && (error != '')) { console.log('ERROR: Unable to enable MeshCentral as a service: ' + error); process.exit(); return; }
                            if (stdout.length > 0) { console.log(stdout); }
                            console.log('Starting service...');
                            require('child_process').exec('sudo systemctl start meshcentral.service', {}, function (error, stdout, stderr) {
                                if ((error != null) && (error != '')) { console.log('ERROR: Unable to start MeshCentral as a service: ' + error); process.exit(); return; }
                                if (stdout.length > 0) { console.log(stdout); }
                                console.log('Done.');
                            });
                        });
                    });
                });
                return;
            } else if (obj.args.uninstall == true) {
                // Uninstall MeshCentral in Systemd
                console.log('Uninstalling MeshCentral background service...');
                var systemdConf = null;
                if (require('fs').existsSync('/etc/systemd/system')) { systemdConf = '/etc/systemd/system/meshcentral.service'; }
                else if (require('fs').existsSync('/lib/systemd/system')) { systemdConf = '/lib/systemd/system/meshcentral.service'; }
                else if (require('fs').existsSync('/usr/lib/systemd/system')) { systemdConf = '/usr/lib/systemd/system/meshcentral.service'; }
                else { console.log('Unable to find systemd configuration folder.'); process.exit(); return; }
                console.log('Stopping service...');
                require('child_process').exec('sudo systemctl stop meshcentral.service', {}, function (err, stdout, stderr) {
                    if ((err != null) && (err != '')) { console.log('ERROR: Unable to stop MeshCentral as a service: ' + err); }
                    if (stdout.length > 0) { console.log(stdout); }
                    console.log('Disabling service...');
                    require('child_process').exec('sudo systemctl disable meshcentral.service', {}, function (err, stdout, stderr) {
                        if ((err != null) && (err != '')) { console.log('ERROR: Unable to disable MeshCentral as a service: ' + err); }
                        if (stdout.length > 0) { console.log(stdout); }
                        console.log('Removing config file...');
                        require('child_process').exec('sudo rm ' + systemdConf, {}, function (err, stdout, stderr) {
                            if ((err != null) && (err != '')) { console.log('ERROR: Unable to delete MeshCentral config file: ' + err); }
                            console.log('Done.');
                        });
                    });
                });
                return;
            } else if (obj.args.start == true) {
                // Start MeshCentral in Systemd
                require('child_process').exec('sudo systemctl start meshcentral.service', {}, function (err, stdout, stderr) {
                    if ((err != null) && (err != '')) { console.log('ERROR: Unable to start MeshCentral: ' + err); process.exit(); return; }
                    console.log('Done.');
                });
                return;
            } else if (obj.args.stop == true) {
                // Stop MeshCentral in Systemd
                require('child_process').exec('sudo systemctl stop meshcentral.service', {}, function (err, stdout, stderr) {
                    if ((err != null) && (err != '')) { console.log('ERROR: Unable to stop MeshCentral: ' + err); process.exit(); return; }
                    console.log('Done.');
                });
                return;
            } else if (obj.args.restart == true) {
                // Restart MeshCentral in Systemd
                require('child_process').exec('sudo systemctl restart meshcentral.service', {}, function (err, stdout, stderr) {
                    if ((err != null) && (err != '')) { console.log('ERROR: Unable to restart MeshCentral: ' + err); process.exit(); return; }
                    console.log('Done.');
                });
                return;
            }
        }

        // Windows background service handling
        if ((obj.platform == 'win32') && (obj.service != null)) {
            // Check if we need to install, start, stop, remove ourself as a background service
            if (((obj.args.xinstall == true) || (obj.args.xuninstall == true) || (obj.args.start == true) || (obj.args.stop == true) || (obj.args.restart == true))) {
                var env = [], xenv = ['user', 'port', 'aliasport', 'mpsport', 'mpsaliasport', 'redirport', 'exactport', 'rediraliasport', 'debug'];
                for (i in xenv) { if (obj.args[xenv[i]] != null) { env.push({ name: 'mesh' + xenv[i], value: obj.args[xenv[i]] }); } } // Set some args as service environement variables.
                var svc = new obj.service({ name: 'MeshCentral', description: 'MeshCentral Remote Management Server', script: obj.path.join(__dirname, 'winservice.js'), env: env, wait: 2, grow: 0.5 });
                svc.on('install', function () { console.log('MeshCentral service installed.'); svc.start(); });
                svc.on('uninstall', function () { console.log('MeshCentral service uninstalled.'); process.exit(); });
                svc.on('start', function () { console.log('MeshCentral service started.'); process.exit(); });
                svc.on('stop', function () { console.log('MeshCentral service stopped.'); if (obj.args.stop) { process.exit(); } if (obj.args.restart) { console.log('Holding 5 seconds...'); setTimeout(function () { svc.start(); }, 5000); } });
                svc.on('alreadyinstalled', function () { console.log('MeshCentral service already installed.'); process.exit(); });
                svc.on('invalidinstallation', function () { console.log('Invalid MeshCentral service installation.'); process.exit(); });

                if (obj.args.xinstall == true) { try { svc.install(); } catch (e) { logException(e); } }
                if (obj.args.stop == true || obj.args.restart == true) { try { svc.stop(); } catch (e) { logException(e); } }
                if (obj.args.start == true || obj.args.restart == true) { try { svc.start(); } catch (e) { logException(e); } }
                if (obj.args.xuninstall == true) { try { svc.uninstall(); } catch (e) { logException(e); } }
                return;
            }

            // Windows service install using the external winservice.js
            if (obj.args.install == true) {
                console.log('Installing MeshCentral as Windows Service...');
                if (obj.fs.existsSync(obj.path.join(__dirname, '../WinService')) == false) { try { obj.fs.mkdirSync(obj.path.join(__dirname, '../WinService')); } catch (ex) { console.log('ERROR: Unable to create WinService folder: ' + ex); process.exit(); return; } }
                try { obj.fs.createReadStream(obj.path.join(__dirname, 'winservice.js')).pipe(obj.fs.createWriteStream(obj.path.join(__dirname, '../WinService/winservice.js'))); } catch (ex) { console.log('ERROR: Unable to copy winservice.js: ' + ex); process.exit(); return; }
                require('child_process').exec('node winservice.js --install', { maxBuffer: 512000, timeout: 120000, cwd: obj.path.join(__dirname, '../WinService') }, function (error, stdout, stderr) {
                    if ((error != null) && (error != '')) { console.log('ERROR: Unable to install MeshCentral as a service: ' + error); process.exit(); return; }
                    console.log(stdout);
                });
                return;
            } else if (obj.args.uninstall == true) {
                console.log('Uninstalling MeshCentral Windows Service...');
                if (obj.fs.existsSync(obj.path.join(__dirname, '../WinService')) == true) {
                    require('child_process').exec('node winservice.js --uninstall', { maxBuffer: 512000, timeout: 120000, cwd: obj.path.join(__dirname, '../WinService') }, function (error, stdout, stderr) {
                        if ((error != null) && (error != '')) { console.log('ERROR: Unable to uninstall MeshCentral service: ' + error); process.exit(); return; }
                        console.log(stdout);
                        try { obj.fs.unlinkSync(obj.path.join(__dirname, '../WinService/winservice.js')); } catch (ex) { }
                        try { obj.fs.rmdirSync(obj.path.join(__dirname, '../WinService')); } catch (ex) { }
                    });
                } else {
                    require('child_process').exec('node winservice.js --uninstall', { maxBuffer: 512000, timeout: 120000, cwd: __dirname }, function (error, stdout, stderr) {
                        if ((error != null) && (error != '')) { console.log('ERROR: Unable to uninstall MeshCentral service: ' + error); process.exit(); return; }
                        console.log(stdout);
                    });
                }
                return;
            }
        }

        // If "--launch" is in the arguments, launch now
        if (obj.args.launch) {
            if (obj.args.vault) { obj.StartVault(); } else { obj.StartEx(); }
        } else {
            // if "--launch" is not specified, launch the server as a child process.
            var startArgs = [];
            for (i in process.argv) {
                if (i > 0) {
                    var arg = process.argv[i];
                    if ((arg.length > 0) && ((arg.indexOf(' ') >= 0) || (arg.indexOf('&') >= 0))) { startArgs.push(arg); } else { startArgs.push(arg); }
                }
            }
            startArgs.push('--launch', process.pid);
            obj.launchChildServer(startArgs);
        }
    };

    // Launch MeshCentral as a child server and monitor it.
    obj.launchChildServer = function (startArgs) {
        var child_process = require('child_process');
        childProcess = child_process.execFile(process.argv[0], startArgs, { maxBuffer: Infinity, cwd: obj.parentpath }, function (error, stdout, stderr) {
            if (childProcess.xrestart == 1) {
                setTimeout(function () { obj.launchChildServer(startArgs); }, 500); // This is an expected restart.
            } else if (childProcess.xrestart == 2) {
                console.log('Expected exit...');
                process.exit(); // User CTRL-C exit.
            } else if (childProcess.xrestart == 3) {
                // Server self-update exit
                var version = '';
                if (typeof obj.args.selfupdate == 'string') { version = '@' + obj.args.selfupdate; }
                else if (typeof obj.args.specificupdate == 'string') { version = '@' + obj.args.specificupdate; delete obj.args.specificupdate; }
                var child_process = require('child_process');
                var npmpath = ((typeof obj.args.npmpath == 'string') ? obj.args.npmpath : 'npm');
                var npmproxy = ((typeof obj.args.npmproxy == 'string') ? (' --proxy ' + obj.args.npmproxy) : '');
                var env = Object.assign({}, process.env); // Shallow clone
                if (typeof obj.args.npmproxy == 'string') { env['HTTP_PROXY'] = env['HTTPS_PROXY'] = env['http_proxy'] = env['https_proxy'] = obj.args.npmproxy; }
                var xxprocess = child_process.exec(npmpath + ' install meshcentral' + version + npmproxy, { maxBuffer: Infinity, cwd: obj.parentpath, env: env }, function (error, stdout, stderr) { });
                xxprocess.data = '';
                xxprocess.stdout.on('data', function (data) { xxprocess.data += data; });
                xxprocess.stderr.on('data', function (data) { xxprocess.data += data; });
                xxprocess.on('close', function (code) { console.log('Update completed...'); setTimeout(function () { obj.launchChildServer(startArgs); }, 1000); });
            } else {
                if (error != null) {
                    // This is an un-expected restart
                    console.log(error);
                    console.log('ERROR: MeshCentral failed with critical error, check MeshErrors.txt. Restarting in 5 seconds...');
                    setTimeout(function () { obj.launchChildServer(startArgs); }, 5000);
                }
            }
        });
        childProcess.stdout.on('data', function (data) {
            if (data[data.length - 1] == '\n') { data = data.substring(0, data.length - 1); }
            if (data.indexOf('Updating settings folder...') >= 0) { childProcess.xrestart = 1; }
            else if (data.indexOf('Updating server certificates...') >= 0) { childProcess.xrestart = 1; }
            else if (data.indexOf('Server Ctrl-C exit...') >= 0) { childProcess.xrestart = 2; }
            else if (data.indexOf('Starting self upgrade...') >= 0) { childProcess.xrestart = 3; }
            else if (data.indexOf('Server restart...') >= 0) { childProcess.xrestart = 1; }
            else if (data.indexOf('Starting self upgrade to: ') >= 0) { obj.args.specificupdate = data.substring(26).split('\r')[0].split('\n')[0]; childProcess.xrestart = 3; }
            var datastr = data;
            while (datastr.endsWith('\r') || datastr.endsWith('\n')) { datastr = datastr.substring(0, datastr.length - 1); }
            console.log(datastr);
        });
        childProcess.stderr.on('data', function (data) {
            var datastr = data;
            while (datastr.endsWith('\r') || datastr.endsWith('\n')) { datastr = datastr.substring(0, datastr.length - 1); }
            console.log('ERR: ' + datastr);
            if (data.startsWith('le.challenges[tls-sni-01].loopback')) { return; } // Ignore this error output from GreenLock
            if (data[data.length - 1] == '\n') { data = data.substring(0, data.length - 1); }
            try {
                var errlogpath = null;
                if (typeof obj.args.mesherrorlogpath == 'string') { errlogpath = obj.path.join(obj.args.mesherrorlogpath, 'mesherrors.txt'); } else { errlogpath = obj.getConfigFilePath('mesherrors.txt'); }
                obj.fs.appendFileSync(errlogpath, '-------- ' + new Date().toLocaleString() + ' ---- ' + getCurrentVerion() + ' --------\r\n\r\n' + data + '\r\n\r\n\r\n');
            } catch (ex) { console.log('ERROR: Unable to write to mesherrors.txt.'); }
        });
        childProcess.on('close', function (code) { if ((code != 0) && (code != 123)) { /* console.log("Exited with code " + code); */ } });
    };

    // Get current and latest MeshCentral server versions using NPM
    obj.getLatestServerVersion = function (callback) {
        if (callback == null) return;
        try {
            if (typeof obj.args.selfupdate == 'string') { callback(getCurrentVerion(), obj.args.selfupdate); return; } // If we are targetting a specific version, return that one as current.
            var child_process = require('child_process');
            var npmpath = ((typeof obj.args.npmpath == 'string') ? obj.args.npmpath : 'npm');
            var npmproxy = ((typeof obj.args.npmproxy == 'string') ? (' --proxy ' + obj.args.npmproxy) : '');
            var env = Object.assign({}, process.env); // Shallow clone
            if (typeof obj.args.npmproxy == 'string') { env['HTTP_PROXY'] = env['HTTPS_PROXY'] = env['http_proxy'] = env['https_proxy'] = obj.args.npmproxy; }
            var xxprocess = child_process.exec(npmpath + npmproxy + ' view meshcentral dist-tags.latest', { maxBuffer: 512000, cwd: obj.parentpath, env: env }, function (error, stdout, stderr) { });
            xxprocess.data = '';
            xxprocess.stdout.on('data', function (data) { xxprocess.data += data; });
            xxprocess.stderr.on('data', function (data) { });
            xxprocess.on('close', function (code) {
                var latestVer = null;
                if (code == 0) { try { latestVer = xxprocess.data.split(' ').join('').split('\r').join('').split('\n').join(''); } catch (e) { } }
                callback(getCurrentVerion(), latestVer);
            });
        } catch (ex) { callback(getCurrentVerion(), null, ex); } // If the system is running out of memory, an exception here can easily happen.
    };

    // Get current version and all MeshCentral server tags using NPM
    obj.getServerTags = function (callback) {
        if (callback == null) return;
        try {
            if (typeof obj.args.selfupdate == 'string') { callback({ current: getCurrentVerion(), latest: obj.args.selfupdate }); return; } // If we are targetting a specific version, return that one as current.
            var child_process = require('child_process');
            var npmpath = ((typeof obj.args.npmpath == 'string') ? obj.args.npmpath : 'npm');
            var npmproxy = ((typeof obj.args.npmproxy == 'string') ? (' --proxy ' + obj.args.npmproxy) : '');
            var env = Object.assign({}, process.env); // Shallow clone
            if (typeof obj.args.npmproxy == 'string') { env['HTTP_PROXY'] = env['HTTPS_PROXY'] = env['http_proxy'] = env['https_proxy'] = obj.args.npmproxy; }
            var xxprocess = child_process.exec(npmpath + npmproxy + ' dist-tag ls meshcentral', { maxBuffer: 512000, cwd: obj.parentpath, env: env }, function (error, stdout, stderr) { });
            xxprocess.data = '';
            xxprocess.stdout.on('data', function (data) { xxprocess.data += data; });
            xxprocess.stderr.on('data', function (data) { });
            xxprocess.on('close', function (code) {
                var tags = { current: getCurrentVerion() };
                if (code == 0) {
                    try {
                        var lines = xxprocess.data.split('\r\n').join('\n').split('\n');
                        for (var i in lines) { var s = lines[i].split(': '); if ((s.length == 2) && (obj.args.npmtag == null) || (obj.args.npmtag == s[0])) { tags[s[0]] = s[1]; } }
                    } catch (e) { }
                }
                callback(tags);
            });
        } catch (ex) { callback({ current: getCurrentVerion() }, ex); } // If the system is running out of memory, an exception here can easily happen.
    };

    // Initiate server self-update
    obj.performServerUpdate = function (version) {
        if (obj.serverSelfWriteAllowed != true) return false;
        if ((version == null) || (version == '') || (typeof version != 'string')) { console.log('Starting self upgrade...'); } else { console.log('Starting self upgrade to: ' + version); }
        process.exit(200); 
        return true;
    };

    // Initiate server self-update
    obj.performServerCertUpdate = function () { console.log('Updating server certificates...'); process.exit(200); };

    // Start by loading configuration from Vault
    obj.StartVault = function () {
        // Check that the configuration can only be loaded from one place
        if ((obj.args.vault != null) && (obj.args.loadconfigfromdb != null)) { console.log("Can't load configuration from both database and Vault."); process.exit(); return; }

        // Fix arguments if needed
        if (typeof obj.args.vault == 'string') {
            obj.args.vault = { endpoint: obj.args.vault };
            if (typeof obj.args.token == 'string') { obj.args.vault.token = obj.args.token; }
            if (typeof obj.args.unsealkey == 'string') { obj.args.vault.unsealkey = obj.args.unsealkey; }
            if (typeof obj.args.name == 'string') { obj.args.vault.name = obj.args.name; }
        }

        // Load configuration for HashiCorp's Vault if needed
        if (obj.args.vault) {
            if (obj.args.vault.endpoint == null) { console.log('Missing Vault endpoint.'); process.exit(); return; }
            if (obj.args.vault.token == null) { console.log('Missing Vault token.'); process.exit(); return; }
            if (obj.args.vault.unsealkey == null) { console.log('Missing Vault unsealkey.'); process.exit(); return; }
            if (obj.args.vault.name == null) { obj.args.vault.name = 'meshcentral'; }

            // Get new instance of the client
            var vault = require("node-vault")({ endpoint: obj.args.vault.endpoint, token: obj.args.vault.token });
            vault.unseal({ key: obj.args.vault.unsealkey })
                .then(() => {
                    if (obj.args.vaultdeleteconfigfiles) {
                        vault.delete('secret/data/' + obj.args.vault.name)
                            .then(function (r) { console.log('Done.'); process.exit(); })
                            .catch(function (x) { console.log(x); process.exit(); });
                    } else if (obj.args.vaultpushconfigfiles) {
                        // Push configuration files into Vault
                        if ((obj.args.vaultpushconfigfiles == '*') || (obj.args.vaultpushconfigfiles === true)) { obj.args.vaultpushconfigfiles = obj.datapath; }
                        obj.fs.readdir(obj.args.vaultpushconfigfiles, function (err, files) {
                            if (err != null) { console.log('ERROR: Unable to read from folder ' + obj.args.vaultpushconfigfiles); process.exit(); return; }
                            var configFound = false;
                            for (var i in files) { if (files[i] == 'config.json') { configFound = true; } }
                            if (configFound == false) { console.log('ERROR: No config.json in folder ' + obj.args.vaultpushconfigfiles); process.exit(); return; }
                            var configFiles = {};
                            for (var i in files) {
                                const file = files[i];
                                if ((file == 'config.json') || file.endsWith('.key') || file.endsWith('.crt') || (file == 'terms.txt') || file.endsWith('.jpg') || file.endsWith('.png')) {
                                    const path = obj.path.join(obj.args.vaultpushconfigfiles, files[i]), binary = Buffer.from(obj.fs.readFileSync(path, { encoding: 'binary' }), 'binary');
                                    console.log('Pushing ' + file + ', ' + binary.length + ' bytes.');
                                    if (file.endsWith('.json') || file.endsWith('.key') || file.endsWith('.crt')) { configFiles[file] = binary.toString(); } else { configFiles[file] = binary.toString('base64'); }
                                }
                            }
                            vault.write('secret/data/' + obj.args.vault.name, { "data": configFiles })
                                .then(function (r) { console.log('Done.'); process.exit(); })
                                .catch(function (x) { console.log(x); process.exit(); });
                        });
                    } else {
                        // Read configuration files from Vault
                        vault.read('secret/data/' + obj.args.vault.name)
                            .then(function (r) {
                                if ((r == null) || (r.data == null) || (r.data.data == null)) { console.log('Unable to read configuration from Vault.'); process.exit(); return; }
                                var configFiles = obj.configurationFiles = r.data.data;

                                // Decode Base64 when needed
                                for (var file in configFiles) { if (!file.endsWith('.json') && !file.endsWith('.key') && !file.endsWith('.crt')) { configFiles[file] = Buffer.from(configFiles[file], 'base64'); } }

                                // Save all of the files
                                if (obj.args.vaultpullconfigfiles) {
                                    for (var i in configFiles) {
                                        var fullFileName = obj.path.join(obj.args.vaultpullconfigfiles, i);
                                        try { obj.fs.writeFileSync(fullFileName, configFiles[i]); } catch (ex) { console.log('Unable to write to ' + fullFileName); process.exit(); return; }
                                        console.log('Pulling ' + i + ', ' + configFiles[i].length + ' bytes.');
                                    }
                                    console.log('Done.');
                                    process.exit();
                                }

                                // Parse the new configuration file
                                var config2 = null;
                                try { config2 = JSON.parse(configFiles['config.json']); } catch (ex) { console.log('Error, unable to parse config.json from Vault.'); process.exit(); return; }

                                // Set the command line arguments to the config file if they are not present
                                if (!config2.settings) { config2.settings = {}; }
                                for (var i in args) { config2.settings[i] = args[i]; }
                                obj.args = args = config2.settings;

                                // Lower case all keys in the config file
                                try {
                                    require('./common.js').objKeysToLower(config2, ['ldapoptions', 'defaultuserwebstate', 'forceduserwebstate']);
                                } catch (ex) {
                                    console.log('CRITICAL ERROR: Unable to access the file \"./common.js\".\r\nCheck folder & file permissions.');
                                    process.exit();
                                    return;
                                }

                                // Grad some of the values from the original config.json file if present.
                                if ((config.settings.vault != null) && (config2.settings != null)) { config2.settings.vault = config.settings.vault; }

                                // We got a new config.json from the database, let's use it.
                                config = obj.config = config2;
                                obj.StartEx();
                            })
                            .catch(function (x) { console.log(x); process.exit(); });
                    }
                }).catch(function (x) { console.log(x); process.exit(); });
            return;
        }
    }

    // Look for easy command line instructions and do them here.
    obj.StartEx = function () {
        var i;
        //var wincmd = require('node-windows');
        //wincmd.list(function (svc) { console.log(svc); }, true);

        // Setup syslog support
        if ((require('os').platform() != 'win32') && ((config.settings.syslog != null) || (config.settings.syslogjson != null) || (config.settings.syslogauth != null))) {
            if (config.settings.syslog === true) { config.settings.syslog = 'meshcentral'; }
            if (config.settings.syslogjson === true) { config.settings.syslogjson = 'meshcentral-json'; }
            if (config.settings.syslogauth === true) { config.settings.syslogauth = 'meshcentral-auth'; }
            if (typeof config.settings.syslog == 'string') {
                obj.syslog = require('modern-syslog');
                console.log('Starting ' + config.settings.syslog + ' syslog.');
                obj.syslog.init(config.settings.syslog, obj.syslog.LOG_PID | obj.syslog.LOG_ODELAY, obj.syslog.LOG_LOCAL0);
                obj.syslog.log(obj.syslog.LOG_INFO, "MeshCentral v" + getCurrentVerion() + " Server Start");
            }
            if (typeof config.settings.syslogjson == 'string') {
                obj.syslogjson = require('modern-syslog');
                console.log('Starting ' + config.settings.syslogjson + ' JSON syslog.');
                obj.syslogjson.init(config.settings.syslogjson, obj.syslogjson.LOG_PID | obj.syslogjson.LOG_ODELAY, obj.syslogjson.LOG_LOCAL0);
                obj.syslogjson.log(obj.syslogjson.LOG_INFO, "MeshCentral v" + getCurrentVerion() + " Server Start");
            }
            if (typeof config.settings.syslogauth == 'string') {
                obj.authlog = true;
                obj.syslogauth = require('modern-syslog');
                console.log('Starting ' + config.settings.syslogauth + ' auth syslog.');
                obj.syslogauth.init(config.settings.syslogauth, obj.syslogauth.LOG_PID | obj.syslogauth.LOG_ODELAY, obj.syslogauth.LOG_LOCAL0);
                obj.syslogauth.log(obj.syslogauth.LOG_INFO, "MeshCentral v" + getCurrentVerion() + " Server Start");
            }
        }

        // Check top level configuration for any unreconized values
        if (config) { for (var i in config) { if ((typeof i == 'string') && (i.length > 0) && (i[0] != '_') && (['settings', 'domaindefaults', 'domains', 'configfiles', 'smtp', 'letsencrypt', 'peers', 'sms', '$schema'].indexOf(i) == -1)) { addServerWarning('Unrecognized configuration option \"' + i + '\".'); } } }

        if (typeof obj.args.userallowedip == 'string') { if (obj.args.userallowedip == '') { config.settings.userallowedip = obj.args.userallowedip = null; } else { config.settings.userallowedip = obj.args.userallowedip = obj.args.userallowedip.split(','); } }
        if (typeof obj.args.userblockedip == 'string') { if (obj.args.userblockedip == '') { config.settings.userblockedip = obj.args.userblockedip = null; } else { config.settings.userblockedip = obj.args.userblockedip = obj.args.userblockedip.split(','); } }
        if (typeof obj.args.agentallowedip == 'string') { if (obj.args.agentallowedip == '') { config.settings.agentallowedip = obj.args.agentallowedip = null; } else { config.settings.agentallowedip = obj.args.agentallowedip = obj.args.agentallowedip.split(','); } }
        if (typeof obj.args.agentblockedip == 'string') { if (obj.args.agentblockedip == '') { config.settings.agentblockedip = obj.args.agentblockedip = null; } else { config.settings.agentblockedip = obj.args.agentblockedip = obj.args.agentblockedip.split(','); } }
        if (typeof obj.args.swarmallowedip == 'string') { if (obj.args.swarmallowedip == '') { obj.args.swarmallowedip = null; } else { obj.args.swarmallowedip = obj.args.swarmallowedip.split(','); } }
        if ((typeof obj.args.agentupdateblocksize == 'number') && (obj.args.agentupdateblocksize >= 1024) && (obj.args.agentupdateblocksize <= 65531)) { obj.agentUpdateBlockSize = obj.args.agentupdateblocksize; }
        if (typeof obj.args.trustedproxy == 'string') { obj.args.trustedproxy = obj.args.trustedproxy.split(' ').join('').split(','); }
        if (typeof obj.args.tlsoffload == 'string') { obj.args.tlsoffload = obj.args.tlsoffload.split(' ').join('').split(','); }

        // Check if WebSocket compression is supported. It's known to be broken in NodeJS v11.11 to v12.15, and v13.2
        const verSplit = process.version.substring(1).split('.');
        var ver = parseInt(verSplit[0]) + (parseInt(verSplit[1]) / 100);
        if (((ver >= 11.11) && (ver <= 12.15)) || (ver == 13.2)) {
            if ((obj.args.wscompression === true) || (obj.args.agentwscompression === true)) { addServerWarning('WebSocket compression is disabled, this feature is broken in NodeJS v11.11 to v12.15 and v13.2'); }
            obj.args.wscompression = obj.args.agentwscompression = false;
            obj.config.settings.wscompression = obj.config.settings.agentwscompression = false;
        }

        // Local console tracing
        if (typeof obj.args.debug == 'string') { obj.debugSources = obj.args.debug.toLowerCase().split(','); }
        else if (typeof obj.args.debug == 'object') { obj.debugSources = obj.args.debug; }
        else if (obj.args.debug === true) { obj.debugSources = '*'; }

        require('./db.js').CreateDB(obj,
            function (db) {
                obj.db = db;
                obj.db.SetupDatabase(function (dbversion) {
                    // See if any database operations needs to be completed
                    if (obj.args.deletedomain) { obj.db.DeleteDomain(obj.args.deletedomain, function () { console.log('Deleted domain ' + obj.args.deletedomain + '.'); process.exit(); }); return; }
                    if (obj.args.deletedefaultdomain) { obj.db.DeleteDomain('', function () { console.log('Deleted default domain.'); process.exit(); }); return; }
                    if (obj.args.showall) { obj.db.GetAll(function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.showusers) { obj.db.GetAllType('user', function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.showitem) { obj.db.Get(obj.args.showitem, function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.listuserids) { obj.db.GetAllType('user', function (err, docs) { for (var i in docs) { console.log(docs[i]._id); } process.exit(); }); return; }
                    if (obj.args.showusergroups) { obj.db.GetAllType('ugrp', function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.shownodes) { obj.db.GetAllType('node', function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.showallmeshes) { obj.db.GetAllType('mesh', function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.showmeshes) { obj.db.GetAllType('mesh', function (err, docs) { var x = []; for (var i in docs) { if (docs[i].deleted == null) { x.push(docs[i]); } } console.log(JSON.stringify(x, null, 2)); process.exit(); }); return; }
                    if (obj.args.showevents) { obj.db.GetAllEvents(function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.showsmbios) { obj.db.GetAllSMBIOS(function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.showpower) { obj.db.getAllPower(function (err, docs) { console.log(JSON.stringify(docs, null, 2)); process.exit(); }); return; }
                    if (obj.args.clearpower) { obj.db.removeAllPowerEvents(function () { process.exit(); }); return; }
                    if (obj.args.showiplocations) { obj.db.GetAllType('iploc', function (err, docs) { console.log(docs); process.exit(); }); return; }
                    if (obj.args.logintoken) { obj.getLoginToken(obj.args.logintoken, function (r) { console.log(r); process.exit(); }); return; }
                    if (obj.args.logintokenkey) { obj.showLoginTokenKey(function (r) { console.log(r); process.exit(); }); return; }
                    if (obj.args.recordencryptionrecode) { obj.db.performRecordEncryptionRecode(function (count) { console.log('Re-encoded ' + count + ' record(s).'); process.exit(); }); return; }
                    if (obj.args.dbstats) { obj.db.getDbStats(function (stats) { console.log(stats); process.exit(); }); return; }
                    if (obj.args.createaccount) { // Create a new user account
                        if ((typeof obj.args.createaccount != 'string') || (obj.args.pass == null) || (obj.args.pass == '') || (obj.args.createaccount.indexOf(' ') >= 0)) { console.log("Usage: --createaccount [userid] --pass [password] --domain (domain) --email (email) --name (name)."); process.exit(); return; }
                        var userid = 'user/' + (obj.args.domain ? obj.args.domain : '') + '/' + obj.args.createaccount.toLowerCase(), domainid = obj.args.domain ? obj.args.domain : '';
                        if (obj.args.createaccount.startsWith('user/')) { userid = obj.args.createaccount; domainid = obj.args.createaccount.split('/')[1]; }
                        if (userid.split('/').length != 3) { console.log("Invalid userid."); process.exit(); return; }
                        obj.db.Get(userid, function (err, docs) {
                            if (err != null) { console.log("Database error: " + err); process.exit(); return;  }
                            if ((docs != null) && (docs.length != 0)) { console.log('User already exists.'); process.exit(); return; }
                            if ((domainid != '') &&  ((config.domains == null) || (config.domains[domainid] == null))) { console.log("Invalid domain."); process.exit(); return; }
                            var user = { _id: userid, type: 'user', name: (typeof obj.args.name == 'string') ? obj.args.name : (userid.split('/')[2]), domain: domainid, creation: Math.floor(Date.now() / 1000), links: {} };
                            if (typeof obj.args.email == 'string') { user.email = obj.args.email; user.emailVerified = true; }
                            require('./pass').hash(obj.args.pass, function (err, salt, hash, tag) { if (err) { console.log("Unable create account password: " + err); process.exit(); return; } user.salt = salt; user.hash = hash; obj.db.Set(user, function () { console.log("Done."); process.exit(); return; }); }, 0);
                        });
                        return;
                    }
                    if (obj.args.resetaccount) { // Unlock a user account, set a new password and remove 2FA
                        if ((typeof obj.args.resetaccount != 'string') || (obj.args.pass == null) || (obj.args.pass == '') || (obj.args.resetaccount.indexOf(' ') >= 0)) { console.log("Usage: --resetaccount [userid] --domain (domain) --pass [password]."); process.exit(); return; }
                        var userid = 'user/' + (obj.args.domain ? obj.args.domain : '') + '/' + obj.args.resetaccount.toLowerCase();
                        if (obj.args.resetaccount.startsWith('user/')) { userid = obj.args.resetaccount; }
                        if (userid.split('/').length != 3) { console.log("Invalid userid."); process.exit(); return; }
                        obj.db.Get(userid, function (err, docs) {
                            if (err != null) { console.log("Database error: " + err); process.exit(); return; }
                            if ((docs == null) || (docs.length == 0)) { console.log("Unknown userid, usage: --resetaccount [userid] --domain (domain) --pass [password]."); process.exit(); return; }
                            var user = docs[0]; if ((user.siteadmin) && (user.siteadmin != 0xFFFFFFFF) && (user.siteadmin & 32) != 0) { user.siteadmin -= 32; } // Unlock the account.
                            delete user.otpekey; delete user.otpsecret; delete user.otpkeys; delete user.otphkeys; // Disable 2FA
                            require('./pass').hash(obj.args.pass, user.salt, function (err, hash, tag) { if (err) { console.log("Unable to reset password: " + err); process.exit(); return; } user.hash = hash; obj.db.Set(user, function () { console.log("Done."); process.exit(); return; }); }, 0);
                        });
                        return;
                    }
                    if (obj.args.adminaccount) { // Set a user account to server administrator
                        if ((typeof obj.args.adminaccount != 'string') || (obj.args.adminaccount.indexOf(' ') >= 0)) { console.log("Invalid userid, usage: --adminaccount [username] --domain (domain)."); process.exit(); return; }
                        var userid = 'user/' + (obj.args.domain ? obj.args.domain : '') + '/' + obj.args.adminaccount.toLowerCase();
                        if (obj.args.adminaccount.startsWith('user/')) { userid = obj.args.adminaccount; }
                        if (userid.split('/').length != 3) { console.log("Invalid userid."); process.exit(); return; }
                        obj.db.Get(userid, function (err, docs) {
                            if (err != null) { console.log("Database error: " + err); process.exit(); return; }
                            if ((docs == null) || (docs.length == 0)) { console.log("Unknown userid, usage: --adminaccount [userid] --domain (domain)."); process.exit(); return; }
                            docs[0].siteadmin = 0xFFFFFFFF; // Set user as site administrator
                            obj.db.Set(docs[0], function () { console.log("Done."); process.exit(); return; });
                        });
                        return;
                    }
                    if (obj.args.removeaccount) { // Remove a user account
                        if ((typeof obj.args.removeaccount != 'string') || (obj.args.removeaccount.indexOf(' ') >= 0)) { console.log("Invalid userid, usage: --removeaccount [username] --domain (domain)."); process.exit(); return; }
                        var userid = 'user/' + (obj.args.domain ? obj.args.domain : '') + '/' + obj.args.removeaccount.toLowerCase();
                        if (obj.args.removeaccount.startsWith('user/')) { userid = obj.args.removeaccount; }
                        if (userid.split('/').length != 3) { console.log("Invalid userid."); process.exit(); return; }
                        obj.db.Get(userid, function (err, docs) {
                            if (err != null) { console.log("Database error: " + err); process.exit(); return; }
                            if ((docs == null) || (docs.length == 0)) { console.log("Unknown userid, usage: --removeaccount [userid] --domain (domain)."); process.exit(); return; }
                            if ((docs[0].links != null) && (Object.keys(docs[0].links).length > 0)) { console.log("Unable to delete account since user has device rights."); process.exit(); return; }
                            obj.db.Remove(docs[0]._id, function () { console.log("Done."); process.exit(); return; });
                        });
                        return;
                    }

                    // Show a list of all configuration files in the database
                    if (obj.args.dblistconfigfiles) {
                        obj.db.GetAllType('cfile', function (err, docs) { if (err == null) { if (docs.length == 0) { console.log("No files found."); } else { for (var i in docs) { console.log(docs[i]._id.split('/')[1] + ', ' + Buffer.from(docs[i].data, 'base64').length + ' bytes.'); } } } else { console.log('Unable to read from database.'); } process.exit(); }); return;
                    }

                    // Display the content of a configuration file in the database
                    if (obj.args.dbshowconfigfile) {
                        if (typeof obj.args.configkey != 'string') { console.log("Error, --configkey is required."); process.exit(); return; }
                        obj.db.getConfigFile(obj.args.dbshowconfigfile, function (err, docs) {
                            if (err == null) {
                                if (docs.length == 0) { console.log("File not found."); } else {
                                    var data = obj.db.decryptData(obj.args.configkey, docs[0].data);
                                    if (data == null) { console.log("Invalid config key."); } else { console.log(data); }
                                }
                            } else { console.log("Unable to read from database."); }
                            process.exit();
                        }); return;
                    }

                    // Delete all configuration files from database
                    if (obj.args.dbdeleteconfigfiles) {
                        console.log("Deleting all configuration files from the database..."); obj.db.RemoveAllOfType('cfile', function () { console.log('Done.'); process.exit(); });
                    }

                    // Push all relevent files from meshcentral-data into the database
                    if (obj.args.dbpushconfigfiles) {
                        if (typeof obj.args.configkey != 'string') { console.log("Error, --configkey is required."); process.exit(); return; }
                        if ((obj.args.dbpushconfigfiles !== true) && (typeof obj.args.dbpushconfigfiles != 'string')) {
                            console.log("Usage: --dbpulldatafiles (path)     This will import files from folder into the database");
                            console.log("       --dbpulldatafiles            This will import files from meshcentral-data into the db.");
                            process.exit();
                        } else {
                            if ((obj.args.dbpushconfigfiles == '*') || (obj.args.dbpushconfigfiles === true)) { obj.args.dbpushconfigfiles = obj.datapath; }
                            obj.fs.readdir(obj.args.dbpushconfigfiles, function (err, files) {
                                if (err != null) { console.log('ERROR: Unable to read from folder ' + obj.args.dbpushconfigfiles); process.exit(); return; }
                                var configFound = false;
                                for (var i in files) { if (files[i] == 'config.json') { configFound = true; } }
                                if (configFound == false) { console.log('ERROR: No config.json in folder ' + obj.args.dbpushconfigfiles); process.exit(); return; }
                                obj.db.RemoveAllOfType('cfile', function () {
                                    obj.fs.readdir(obj.args.dbpushconfigfiles, function (err, files) {
                                        var lockCount = 1
                                        for (var i in files) {
                                            const file = files[i];
                                            if ((file == 'config.json') || file.endsWith('.key') || file.endsWith('.crt') || (file == 'terms.txt') || file.endsWith('.jpg') || file.endsWith('.png')) {
                                                const path = obj.path.join(obj.args.dbpushconfigfiles, files[i]), binary = Buffer.from(obj.fs.readFileSync(path, { encoding: 'binary' }), 'binary');
                                                console.log('Pushing ' + file + ', ' + binary.length + ' bytes.');
                                                lockCount++;
                                                obj.db.setConfigFile(file, obj.db.encryptData(obj.args.configkey, binary), function () { if ((--lockCount) == 0) { console.log('Done.'); process.exit(); } });
                                            }
                                        }
                                        if (--lockCount == 0) { process.exit(); }
                                    });
                                });
                            });
                        }
                        return;
                    }

                    // Pull all database files into meshcentral-data
                    if (obj.args.dbpullconfigfiles) {
                        if (typeof obj.args.configkey != 'string') { console.log("Error, --configkey is required."); process.exit(); return; }
                        if (typeof obj.args.dbpullconfigfiles != 'string') {
                            console.log("Usage: --dbpulldatafiles (path)");
                            process.exit();
                        } else {
                            obj.db.GetAllType('cfile', function (err, docs) {
                                if (err == null) {
                                    if (docs.length == 0) {
                                        console.log("File not found.");
                                    } else {
                                        for (var i in docs) {
                                            const file = docs[i]._id.split('/')[1], binary = obj.db.decryptData(obj.args.configkey, docs[i].data);
                                            if (binary == null) {
                                                console.log("Invalid config key.");
                                            } else {
                                                var fullFileName = obj.path.join(obj.args.dbpullconfigfiles, file);
                                                try { obj.fs.writeFileSync(fullFileName, binary); } catch (ex) { console.log('Unable to write to ' + fullFileName); process.exit(); return; }
                                                console.log('Pulling ' + file + ', ' + binary.length + ' bytes.');
                                            }
                                        }
                                    }
                                } else {
                                    console.log("Unable to read from database.");
                                }
                                process.exit();
                            });
                        }
                        return;
                    }

                    if (obj.args.dbexport) {
                        // Export the entire database to a JSON file
                        if (obj.args.dbexport == true) { obj.args.dbexport = obj.getConfigFilePath('meshcentral.db.json'); }
                        obj.db.GetAll(function (err, docs) {
                            obj.fs.writeFileSync(obj.args.dbexport, JSON.stringify(docs));
                            console.log('Exported ' + docs.length + ' objects(s) to ' + obj.args.dbexport + '.'); process.exit();
                        });
                        return;
                    }
                    if (obj.args.dbexportmin) {
                        // Export a minimal database to a JSON file. Export only users, meshes and nodes.
                        // This is a useful command to look at the database.
                        if (obj.args.dbexportmin == true) { obj.args.dbexportmin = obj.getConfigFilePath('meshcentral.db.json'); }
                        obj.db.GetAllType({ $in: ['user', 'node', 'mesh'] }, function (err, docs) {
                            obj.fs.writeFileSync(obj.args.dbexportmin, JSON.stringify(docs));
                            console.log('Exported ' + docs.length + ' objects(s) to ' + obj.args.dbexportmin + '.'); process.exit();
                        });
                        return;
                    }
                    if (obj.args.dbimport) {
                        // Import the entire database from a JSON file
                        if (obj.args.dbimport == true) { obj.args.dbimport = obj.getConfigFilePath('meshcentral.db.json'); }
                        var json = null, json2 = "", badCharCount = 0;
                        try { json = obj.fs.readFileSync(obj.args.dbimport, { encoding: 'utf8' }); } catch (e) { console.log('Invalid JSON file: ' + obj.args.dbimport + ': ' + e); process.exit(); }
                        for (i = 0; i < json.length; i++) { if (json.charCodeAt(i) >= 32) { json2 += json[i]; } else { var tt = json.charCodeAt(i); if (tt != 10 && tt != 13) { badCharCount++; } } } // Remove all bad chars
                        if (badCharCount > 0) { console.log(badCharCount + ' invalid character(s) where removed.'); }
                        try { json = JSON.parse(json2); } catch (e) { console.log('Invalid JSON format: ' + obj.args.dbimport + ': ' + e); process.exit(); }
                        if ((json == null) || (typeof json.length != 'number') || (json.length < 1)) { console.log('Invalid JSON format: ' + obj.args.dbimport + '.'); }
                        for (i in json) { if ((json[i].type == "mesh") && (json[i].links != null)) { for (var j in json[i].links) { var esc = obj.common.escapeFieldName(j); if (esc !== j) { json[i].links[esc] = json[i].links[j]; delete json[i].links[j]; } } } } // Escape MongoDB invalid field chars
                        //for (i in json) { if ((json[i].type == "node") && (json[i].host != null)) { json[i].rname = json[i].host; delete json[i].host; } } // DEBUG: Change host to rname
                        setTimeout(function () { // If the Mongo database is being created for the first time, there is a race condition here. This will get around it.
                            obj.db.RemoveAll(function () {
                                obj.db.InsertMany(json, function (err) {
                                    if (err != null) { console.log(err); } else { console.log('Imported ' + json.length + ' objects(s) from ' + obj.args.dbimport + '.'); } process.exit();
                                });
                            });
                        }, 100);
                        return;
                    }
                    /*
                    if (obj.args.dbimport) {
                        // Import the entire database from a very large JSON file
                        obj.db.RemoveAll(function () {
                            if (obj.args.dbimport == true) { obj.args.dbimport = obj.getConfigFilePath('meshcentral.db.json'); }
                            var json = null, json2 = "", badCharCount = 0;
                            const StreamArray = require('stream-json/streamers/StreamArray');
                            const jsonStream = StreamArray.withParser();
                            jsonStream.on('data', function (data) { obj.db.Set(data.value); });
                            jsonStream.on('end', () => { console.log('Done.'); process.exit(); });
                            obj.fs.createReadStream(obj.args.dbimport).pipe(jsonStream.input);
                        });
                        return;
                    }
                    */
                    if (obj.args.dbmerge) {
                        // Import the entire database from a JSON file
                        if (obj.args.dbmerge == true) { obj.args.dbmerge = obj.getConfigFilePath('meshcentral.db.json'); }
                        var json = null, json2 = "", badCharCount = 0;
                        try { json = obj.fs.readFileSync(obj.args.dbmerge, { encoding: 'utf8' }); } catch (e) { console.log('Invalid JSON file: ' + obj.args.dbmerge + ': ' + e); process.exit(); }
                        for (i = 0; i < json.length; i++) { if (json.charCodeAt(i) >= 32) { json2 += json[i]; } else { var tt = json.charCodeAt(i); if (tt != 10 && tt != 13) { badCharCount++; } } } // Remove all bad chars
                        if (badCharCount > 0) { console.log(badCharCount + ' invalid character(s) where removed.'); }
                        try { json = JSON.parse(json2); } catch (e) { console.log('Invalid JSON format: ' + obj.args.dbmerge + ': ' + e); process.exit(); }
                        if ((json == null) || (typeof json.length != 'number') || (json.length < 1)) { console.log('Invalid JSON format: ' + obj.args.dbimport + '.'); }

                        // Get all users from current database
                        obj.db.GetAllType('user', function (err, docs) {
                            var users = {}, usersCount = 0;
                            for (var i in docs) { users[docs[i]._id] = docs[i]; usersCount++; }

                            // Fetch all meshes from the database
                            obj.db.GetAllType('mesh', function (err, docs) {
                                obj.common.unEscapeAllLinksFieldName(docs);
                                var meshes = {}, meshesCount = 0;
                                for (var i in docs) { meshes[docs[i]._id] = docs[i]; meshesCount++; }
                                console.log('Loaded ' + usersCount + ' users and ' + meshesCount + ' meshes.');
                                // Look at each object in the import file
                                var objectToAdd = [];
                                for (var i in json) {
                                    var newobj = json[i];
                                    if (newobj.type == 'user') {
                                        // Check if the user already exists
                                        var existingUser = users[newobj._id];
                                        if (existingUser) {
                                            // Merge the links
                                            if (typeof newobj.links == 'object') {
                                                for (var j in newobj.links) {
                                                    if ((existingUser.links == null) || (existingUser.links[j] == null)) {
                                                        if (existingUser.links == null) { existingUser.links = {}; }
                                                        existingUser.links[j] = newobj.links[j];
                                                    }
                                                }
                                            }
                                            if (existingUser.name == 'admin') { existingUser.links = {}; }
                                            objectToAdd.push(existingUser); // Add this user
                                        } else {
                                            objectToAdd.push(newobj); // Add this user
                                        }
                                    } else if (newobj.type == 'mesh') {
                                        // Add this object
                                        objectToAdd.push(newobj);
                                    } // Don't add nodes.
                                }
                                console.log('Importing ' + objectToAdd.length + ' object(s)...');
                                var pendingCalls = 1;
                                for (var i in objectToAdd) {
                                    pendingCalls++;
                                    obj.db.Set(objectToAdd[i], function (err) { if (err != null) { console.log(err); } else { if (--pendingCalls == 0) { process.exit(); } } });
                                }
                                if (--pendingCalls == 0) { process.exit(); }
                            });
                        });
                        return;
                    }

                    // Load configuration for database if needed
                    if (obj.args.loadconfigfromdb) {
                        var key = null;
                        if (typeof obj.args.configkey == 'string') { key = obj.args.configkey; }
                        else if (typeof obj.args.loadconfigfromdb == 'string') { key = obj.args.loadconfigfromdb; }
                        if (key == null) { console.log("Error, --configkey is required."); process.exit(); return; }
                        obj.db.getAllConfigFiles(key, function (configFiles) {
                            if (configFiles == null) { console.log("Error, no configuration files found or invalid configkey."); process.exit(); return; }
                            if (!configFiles['config.json']) { console.log("Error, could not file config.json from database."); process.exit(); return; }
                            obj.configurationFiles = configFiles;

                            // Parse the new configuration file
                            var config2 = null;
                            try { config2 = JSON.parse(configFiles['config.json']); } catch (ex) { console.log('Error, unable to parse config.json from database.'); process.exit(); return; }

                            // Set the command line arguments to the config file if they are not present
                            if (!config2.settings) { config2.settings = {}; }
                            for (i in args) { config2.settings[i] = args[i]; }

                            // Lower case all keys in the config file
                            try {
                                require('./common.js').objKeysToLower(config2, ['ldapoptions', 'defaultuserwebstate', 'forceduserwebstate']);
                            } catch (ex) {
                                console.log("CRITICAL ERROR: Unable to access the file \"./common.js\".\r\nCheck folder & file permissions.");
                                process.exit();
                                return;
                            }

                            // Grad some of the values from the original config.json file if present.
                            config2['mysql'] = config['mysql'];
                            config2['mariadb'] = config['mariadb'];
                            config2['mongodb'] = config['mongodb'];
                            config2['mongodbcol'] = config['mongodbcol'];
                            config2['dbencryptkey'] = config['dbencryptkey'];

                            // We got a new config.json from the database, let's use it.
                            config = obj.config = config2;
                            obj.StartEx1b();
                        });
                    } else {
                        config = obj.config = getConfig(obj.args.vault == null);
                        obj.StartEx1b();
                    }
                });
            }
        );
    };

    // Time to start the server of real.
    obj.StartEx1b = function () {
        var i;

        // Linux format /var/log/auth.log
        if (obj.config.settings.authlog != null) {
            obj.fs.open(obj.config.settings.authlog, 'a', function (err, fd) {
                if (err == null) { obj.authlogfile = fd; obj.authlog = true; } else { console.log('ERROR: Unable to open: ' + obj.config.settings.authlog); }
            })
        }

        // Check if self update is allowed. If running as a Windows service, self-update is not possible.
        if (obj.fs.existsSync(obj.path.join(__dirname, 'daemon'))) { obj.serverSelfWriteAllowed = false; }

        // If we are targetting a specific version, update now.
        if ((obj.serverSelfWriteAllowed == true) && (typeof obj.args.selfupdate == 'string')) {
            obj.args.selfupdate = obj.args.selfupdate.toLowerCase();
            if (getCurrentVerion() !== obj.args.selfupdate) { obj.performServerUpdate(); return; } // We are targetting a specific version, run self update now.
        }

        // Write the server state
        obj.updateServerState('state', 'starting');
        if (process.pid) { obj.updateServerState('server-pid', process.pid); }
        if (process.ppid) { obj.updateServerState('server-parent-pid', process.ppid); }

        // Read environment variables. For a subset of arguments, we allow them to be read from environment variables.
        var xenv = ['user', 'port', 'mpsport', 'mpsaliasport', 'redirport', 'rediraliasport', 'exactport', 'debug'];
        for (i in xenv) { if ((obj.args[xenv[i]] == null) && (process.env['mesh' + xenv[i]])) { obj.args[xenv[i]] = obj.common.toNumber(process.env['mesh' + xenv[i]]); } }

        // Validate the domains, this is used for multi-hosting
        if (obj.config.domains == null) { obj.config.domains = {}; }
        if (obj.config.domains[''] == null) { obj.config.domains[''] = {}; }
        if (obj.config.domains[''].dns != null) { console.log("ERROR: Default domain can't have a DNS name."); return; }
        var xdomains = {}; for (i in obj.config.domains) { xdomains[i.toLowerCase()] = obj.config.domains[i]; } obj.config.domains = xdomains;
        var bannedDomains = ['public', 'private', 'images', 'scripts', 'styles', 'views']; // List of banned domains
        for (i in obj.config.domains) { for (var j in bannedDomains) { if (i == bannedDomains[j]) { console.log("ERROR: Domain '" + i + "' is not allowed domain name in config.json."); return; } } }
        for (i in obj.config.domains) {
            // Remove any domains that start with underscore
            if (i.startsWith('_')) { delete obj.config.domains[i]; continue; }

            // Apply default domain settings if present
            if (typeof obj.config.domaindefaults == 'object') { for (var j in obj.config.domaindefaults) { if (obj.config.domains[i][j] == null) { obj.config.domains[i][j] = obj.config.domaindefaults[j]; } } }

            // Perform domain setup
            if (typeof obj.config.domains[i] != 'object') { console.log("ERROR: Invalid domain configuration in config.json."); process.exit(); return; }
            if ((i.length > 0) && (i[0] == '_')) { delete obj.config.domains[i]; continue; } // Remove any domains with names that start with _
            if (typeof config.domains[i].auth == 'string') { config.domains[i].auth = config.domains[i].auth.toLowerCase(); }
            if (obj.config.domains[i].limits == null) { obj.config.domains[i].limits = {}; }
            if (obj.config.domains[i].dns == null) { obj.config.domains[i].url = (i == '') ? '/' : ('/' + i + '/'); } else { obj.config.domains[i].url = '/'; }
            obj.config.domains[i].id = i;
            if (typeof obj.config.domains[i].loginkey == 'string') { obj.config.domains[i].loginkey = [obj.config.domains[i].loginkey]; }
            if ((obj.config.domains[i].loginkey != null) && (obj.common.validateAlphaNumericArray(obj.config.domains[i].loginkey, 1, 128) == false)) { console.log("ERROR: Invalid login key, must be alpha-numeric string with no spaces."); process.exit(); return; }
            if (typeof obj.config.domains[i].userallowedip == 'string') { if (obj.config.domains[i].userallowedip == '') { obj.config.domains[i].userallowedip = null; } else { obj.config.domains[i].userallowedip = obj.config.domains[i].userallowedip.split(','); } }
            if (typeof obj.config.domains[i].userblockedip == 'string') { if (obj.config.domains[i].userblockedip == '') { obj.config.domains[i].userblockedip = null; } else { obj.config.domains[i].userblockedip = obj.config.domains[i].userblockedip.split(','); } }
            if (typeof obj.config.domains[i].agentallowedip == 'string') { if (obj.config.domains[i].agentallowedip == '') { obj.config.domains[i].agentallowedip = null; } else { obj.config.domains[i].agentallowedip = obj.config.domains[i].agentallowedip.split(','); } }
            if (typeof obj.config.domains[i].agentblockedip == 'string') { if (obj.config.domains[i].agentblockedip == '') { obj.config.domains[i].agentblockedip = null; } else { obj.config.domains[i].agentblockedip = obj.config.domains[i].agentblockedip.split(','); } }
            if ((obj.config.domains[i].passwordrequirements != null) && (typeof obj.config.domains[i].passwordrequirements == 'object')) {
                if (typeof obj.config.domains[i].passwordrequirements.skip2factor == 'string') {
                    obj.config.domains[i].passwordrequirements.skip2factor = obj.config.domains[i].passwordrequirements.skip2factor.split(',');
                } else {
                    delete obj.config.domains[i].passwordrequirements.skip2factor;
                }
            }
            if ((obj.config.domains[i].auth == 'ldap') && (typeof obj.config.domains[i].ldapoptions != 'object')) {
                if (i == '') { console.log("ERROR: Default domain is LDAP, but is missing LDAPOptions."); } else { console.log("ERROR: Domain '" + i + "' is LDAP, but is missing LDAPOptions."); }
                process.exit();
                return;
            }
            if ((obj.config.domains[i].auth == 'ldap') || (obj.config.domains[i].auth == 'sspi')) { obj.config.domains[i].newaccounts = 0; } // No new accounts allowed in SSPI/LDAP authentication modes.

            // Convert newAccountsRights from a array of strings to flags number.
            obj.config.domains[i].newaccountsrights = obj.common.meshServerRightsArrayToNumber(obj.config.domains[i].newaccountsrights);
            if (typeof (obj.config.domains[i].newaccountsrights) != 'number') { delete obj.config.domains[i].newaccountsrights; }

            // Check if there is a web views path and/or web public path for this domain
            if ((__dirname.endsWith('/node_modules/meshcentral')) || (__dirname.endsWith('\\node_modules\\meshcentral')) || (__dirname.endsWith('/node_modules/meshcentral/')) || (__dirname.endsWith('\\node_modules\\meshcentral\\'))) {
                if ((obj.config.domains[i].webviewspath == null) && (obj.fs.existsSync(obj.path.join(__dirname, '../../meshcentral-web-' + i + '/views')))) { obj.config.domains[i].webviewspath = obj.path.join(__dirname, '../../meshcentral-web-' + i + '/views'); }
                if ((obj.config.domains[i].webpublicpath == null) && (obj.fs.existsSync(obj.path.join(__dirname, '../../meshcentral-web-' + i + '/public')))) { obj.config.domains[i].webpublicpath = obj.path.join(__dirname, '../../meshcentral-web-' + i + '/public'); }
                if ((obj.config.domains[i].webemailspath == null) && (obj.fs.existsSync(obj.path.join(__dirname, '../../meshcentral-web-' + i + '/emails')))) { obj.config.domains[i].webemailspath = obj.path.join(__dirname, '../../meshcentral-web-' + i + '/emails'); }
            } else {
                if ((obj.config.domains[i].webviewspath == null) && (obj.fs.existsSync(obj.path.join(__dirname, '../meshcentral-web-' + i + '/views')))) { obj.config.domains[i].webviewspath = obj.path.join(__dirname, '../meshcentral-web-' + i + '/views'); }
                if ((obj.config.domains[i].webpublicpath == null) && (obj.fs.existsSync(obj.path.join(__dirname, '../meshcentral-web-' + i + '/public')))) { obj.config.domains[i].webpublicpath = obj.path.join(__dirname, '../meshcentral-web-' + i + '/public'); }
                if ((obj.config.domains[i].webemailspath == null) && (obj.fs.existsSync(obj.path.join(__dirname, '../meshcentral-web-' + i + '/emails')))) { obj.config.domains[i].webemailspath = obj.path.join(__dirname, '../meshcentral-web-' + i + '/emails'); }
            }

            // Check agent customization if any
            if (typeof obj.config.domains[i].agentcustomization == 'object') {
                if (typeof obj.config.domains[i].agentcustomization.displayname != 'string') { delete obj.config.domains[i].agentcustomization.displayname; } else { obj.config.domains[i].agentcustomization.displayname = obj.config.domains[i].agentcustomization.displayname.split('\r').join('').split('\n').join(''); }
                if (typeof obj.config.domains[i].agentcustomization.description != 'string') { delete obj.config.domains[i].agentcustomization.description; } else { obj.config.domains[i].agentcustomization.description = obj.config.domains[i].agentcustomization.description.split('\r').join('').split('\n').join(''); }
                if (typeof obj.config.domains[i].agentcustomization.companyname != 'string') { delete obj.config.domains[i].agentcustomization.companyname; } else { obj.config.domains[i].agentcustomization.companyname = obj.config.domains[i].agentcustomization.companyname.split('\r').join('').split('\n').join(''); }
                if (typeof obj.config.domains[i].agentcustomization.servicename != 'string') { delete obj.config.domains[i].agentcustomization.servicename; } else { obj.config.domains[i].agentcustomization.servicename = obj.config.domains[i].agentcustomization.servicename.split('\r').join('').split('\n').join('').split(' ').join('').split('"').join('').split('\'').join('').split('>').join('').split('<').join('').split('/').join('').split('\\').join(''); }
            } else {
                delete obj.config.domains[i].agentcustomization;
            }
        }

        // Log passed arguments into Windows Service Log
        //if (obj.servicelog != null) { var s = ''; for (i in obj.args) { if (i != '_') { if (s.length > 0) { s += ', '; } s += i + "=" + obj.args[i]; } } logInfoEvent('MeshServer started with arguments: ' + s); }

        // Look at passed in arguments
        if ((obj.args.user != null) && (typeof obj.args.user != 'string')) { delete obj.args.user; }
        if ((obj.args.ciralocalfqdn != null) && ((obj.args.lanonly == true) || (obj.args.wanonly == true))) { addServerWarning("CIRA local FQDN's ignored when server in LAN-only or WAN-only mode."); }
        if ((obj.args.ciralocalfqdn != null) && (obj.args.ciralocalfqdn.split(',').length > 4)) { addServerWarning("Can't have more than 4 CIRA local FQDN's. Ignoring value."); obj.args.ciralocalfqdn = null; }
        if (obj.args.ignoreagenthashcheck === true) { addServerWarning("Agent hash checking is being skipped, this is unsafe."); }
        if (obj.args.port == null || typeof obj.args.port != 'number') { obj.args.port = 443; }
        if (obj.args.aliasport != null && (typeof obj.args.aliasport != 'number')) obj.args.aliasport = null;
        if (obj.args.mpsport == null || typeof obj.args.mpsport != 'number') obj.args.mpsport = 4433;
        if (obj.args.mpsaliasport != null && (typeof obj.args.mpsaliasport != 'number')) obj.args.mpsaliasport = null;
        if (obj.args.rediraliasport != null && (typeof obj.args.rediraliasport != 'number')) obj.args.rediraliasport = null;
        if (obj.args.redirport == null) obj.args.redirport = 80;
        if (obj.args.minifycore === 0) obj.args.minifycore = false;
        if (typeof args.agentidletimeout != 'number') { args.agentidletimeout = 150000; } else { args.agentidletimeout *= 1000 } // Default agent idle timeout is 2m, 30sec.

        // Setup a site administrator
        if ((obj.args.admin) && (typeof obj.args.admin == 'string')) {
            var adminname = obj.args.admin.split('/');
            if (adminname.length == 1) { adminname = 'user//' + adminname[0]; }
            else if (adminname.length == 2) { adminname = 'user/' + adminname[0] + '/' + adminname[1]; }
            else { console.log("Invalid administrator name."); process.exit(); return; }
            obj.db.Get(adminname, function (err, user) {
                if (user.length != 1) { console.log("Invalid user name."); process.exit(); return; }
                user[0].siteadmin = 4294967295; // 0xFFFFFFFF
                obj.db.Set(user[0], function () {
                    if (user[0].domain == '') { console.log('User ' + user[0].name + ' set to site administrator.'); } else { console.log("User " + user[0].name + " of domain " + user[0].domain + " set to site administrator."); }
                    process.exit();
                    return;
                });
            });
            return;
        }

        // Remove a site administrator
        if ((obj.args.unadmin) && (typeof obj.args.unadmin == 'string')) {
            var adminname = obj.args.unadmin.split('/');
            if (adminname.length == 1) { adminname = 'user//' + adminname[0]; }
            else if (adminname.length == 2) { adminname = 'user/' + adminname[0] + '/' + adminname[1]; }
            else { console.log("Invalid administrator name."); process.exit(); return; }
            obj.db.Get(adminname, function (err, user) {
                if (user.length != 1) { console.log("Invalid user name."); process.exit(); return; }
                if (user[0].siteadmin) { delete user[0].siteadmin; }
                obj.db.Set(user[0], function () {
                    if (user[0].domain == '') { console.log("User " + user[0].name + " is not a site administrator."); } else { console.log("User " + user[0].name + " of domain " + user[0].domain + " is not a site administrator."); }
                    process.exit();
                    return;
                });
            });
            return;
        }

        // Perform other database cleanup
        obj.db.cleanup();

        // Set all nodes to power state of unknown (0)
        obj.db.storePowerEvent({ time: new Date(), nodeid: '*', power: 0, s: 1 }, obj.multiServer); // s:1 indicates that the server is starting up.

        // Read or setup database configuration values
        obj.db.Get('dbconfig', function (err, dbconfig) {
            if ((dbconfig != null) && (dbconfig.length == 1)) { obj.dbconfig = dbconfig[0]; } else { obj.dbconfig = { _id: 'dbconfig', version: 1 }; }
            if (obj.dbconfig.amtWsEventSecret == null) { obj.crypto.randomBytes(32, function (err, buf) { obj.dbconfig.amtWsEventSecret = buf.toString('hex'); obj.db.Set(obj.dbconfig); }); }

            // This is used by the user to create a username/password for a Intel AMT WSMAN event subscription
            if (obj.args.getwspass) {
                if (obj.args.getwspass.length == 64) {
                    obj.crypto.randomBytes(6, function (err, buf) {
                        while (obj.dbconfig.amtWsEventSecret == null) { process.nextTick(); }
                        var username = buf.toString('hex');
                        var nodeid = obj.args.getwspass;
                        var pass = obj.crypto.createHash('sha384').update(username.toLowerCase() + ':' + nodeid + ':' + obj.dbconfig.amtWsEventSecret).digest('base64').substring(0, 12).split('/').join('x').split('\\').join('x');
                        console.log("--- Intel(r) AMT WSMAN eventing credentials ---");
                        console.log("Username: " + username);
                        console.log("Password: " + pass);
                        console.log("Argument: " + nodeid);
                        process.exit();
                    });
                } else {
                    console.log("Invalid NodeID.");
                    process.exit();
                }
                return;
            }

            // Start plugin manager if configuration allows this.
            if ((obj.config) && (obj.config.settings) && (obj.config.settings.plugins != null) && (obj.config.settings.plugins != false) && ((typeof obj.config.settings.plugins != 'object') || (obj.config.settings.plugins.enabled != false))) {
                const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);
                if (nodeVersion < 7) {
                    addServerWarning("Plugin support requires Node v7.x or higher.");
                    delete obj.config.settings.plugins;
                } else {
                    obj.pluginHandler = require('./pluginHandler.js').pluginHandler(obj);
                }
            }

            // Load the default meshcore and meshcmd
            obj.updateMeshCore();
            obj.updateMeshCmd();

            // Setup and start the redirection server if needed. We must start the redirection server before Let's Encrypt.
            if ((obj.args.redirport != null) && (typeof obj.args.redirport == 'number') && (obj.args.redirport != 0)) {
                obj.redirserver = require('./redirserver.js').CreateRedirServer(obj, obj.db, obj.args, obj.StartEx2);
            } else {
                obj.StartEx2(); // If not needed, move on.
            }
        });
    }

    // Done starting the redirection server, go on to load the server certificates
    obj.StartEx2 = function () {
        // Load server certificates
        obj.certificateOperations = require('./certoperations.js').CertificateOperations(obj);
        obj.certificateOperations.GetMeshServerCertificate(obj.args, obj.config, function (certs) {
            // Get the current node version
            const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);
            if ((obj.config.letsencrypt == null) || (obj.redirserver == null) || (nodeVersion < 8)) {
                obj.StartEx3(certs); // Just use the configured certificates
            } else if ((obj.config.letsencrypt != null) && (obj.config.letsencrypt.nochecks == true)) {
                // Use Let's Encrypt with no checking
                obj.letsencrypt = require('./letsencrypt.js').CreateLetsEncrypt(obj);
                obj.letsencrypt.getCertificate(certs, obj.StartEx3); // Use Let's Encrypt with no checking, use at your own risk.
            } else {
                // Check Let's Encrypt settings
                var leok = true;
                if ((typeof obj.config.letsencrypt.names != 'string') && (typeof obj.config.settings.cert == 'string')) { obj.config.letsencrypt.names = obj.config.settings.cert; }
                if (typeof obj.config.letsencrypt.email != 'string') { leok = false; addServerWarning("Missing Let's Encrypt email address."); }
                else if (typeof obj.config.letsencrypt.names != 'string') { leok = false; addServerWarning("Invalid Let's Encrypt host names."); }
                else if (obj.config.letsencrypt.names.indexOf('*') >= 0) { leok = false; addServerWarning("Invalid Let's Encrypt names, can't contain a *."); }
                else if (obj.config.letsencrypt.email.split('@').length != 2) { leok = false; addServerWarning("Invalid Let's Encrypt email address."); }
                else if (obj.config.letsencrypt.email.trim() !== obj.config.letsencrypt.email) { leok = false; addServerWarning("Invalid Let's Encrypt email address."); }
                else {
                    var le = require('./letsencrypt.js');
                    try { obj.letsencrypt = le.CreateLetsEncrypt(obj); } catch (ex) { console.log(ex); }
                    if (obj.letsencrypt == null) { addServerWarning("Unable to setup Let's Encrypt module."); leok = false; }
                }
                if (leok == true) {
                    // Check that the email address domain MX resolves.
                    require('dns').resolveMx(obj.config.letsencrypt.email.split('@')[1], function (err, addresses) {
                        if (err == null) {
                            // Check that all names resolve
                            checkResolveAll(obj.config.letsencrypt.names.split(','), function (err) {
                                if (err == null) {
                                    obj.letsencrypt.getCertificate(certs, obj.StartEx3); // Use Let's Encrypt
                                } else {
                                    for (var i in err) { addServerWarning("Invalid Let's Encrypt names, unable to resolve: " + err[i]); }
                                    obj.StartEx3(certs); // Let's Encrypt did not load, just use the configured certificates
                                }
                            });
                        } else {
                            addServerWarning("Invalid Let's Encrypt email address, unable to resolve: " + obj.config.letsencrypt.email.split('@')[1]);
                            obj.StartEx3(certs); // Let's Encrypt did not load, just use the configured certificates
                        }
                    });
                } else {
                    obj.StartEx3(certs); // Let's Encrypt did not load, just use the configured certificates
                }
            }
        });
    };

    // Start the server with the given certificates, but check if we have web certificates to load
    obj.StartEx3 = function (certs) {
        obj.certificates = certs;
        obj.certificateOperations.acceleratorStart(certs); // Set the state of the accelerators

        // Load any domain web certificates
        for (var i in obj.config.domains) {
            // Load any Intel AMT ACM activation certificates
            if (obj.config.domains[i].amtacmactivation == null) { obj.config.domains[i].amtacmactivation = {}; }
            obj.certificateOperations.loadIntelAmtAcmCerts(obj.config.domains[i].amtacmactivation);

            if (typeof obj.config.domains[i].certurl == 'string') {
                obj.supportsProxyCertificatesRequest = true; // If a certurl is set, enable proxy cert requests
                // Then, fix the URL and add 'https://' if needed
                if (obj.config.domains[i].certurl.indexOf('://') < 0) { obj.config.domains[i].certurl = 'https://' + obj.config.domains[i].certurl; }
            }
        }

        if (obj.supportsProxyCertificatesRequest == true) { obj.updateProxyCertificates(true); }
        obj.StartEx4(); // Keep going
    }

    // Start the server with the given certificates
    obj.StartEx4 = function () {
        var i;

        // If the certificate is un-configured, force LAN-only mode
        if (obj.certificates.CommonName.indexOf('.') == -1) { /*console.log('Server name not configured, running in LAN-only mode.');*/ obj.args.lanonly = true; }

        // Write server version and run mode
        var productionMode = (process.env.NODE_ENV && (process.env.NODE_ENV == 'production'));
        var runmode = (obj.args.lanonly ? 2 : (obj.args.wanonly ? 1 : 0));
        console.log("MeshCentral v" + getCurrentVerion() + ', ' + (["Hybrid (LAN + WAN) mode", "WAN mode", "LAN mode"][runmode]) + (productionMode ? ", Production mode." : '.'));

        // Check that no sub-domains have the same DNS as the parent
        for (i in obj.config.domains) {
            if ((obj.config.domains[i].dns != null) && (obj.certificates.CommonName.toLowerCase() === obj.config.domains[i].dns.toLowerCase())) {
                console.log("ERROR: Server sub-domain can't have same DNS name as the parent."); process.exit(0); return;
            }
        }

        // Load the list of MeshCentral tools
        obj.updateMeshTools();

        // Load the list of mesh agents and install scripts
        if (obj.args.noagentupdate == 1) { for (i in obj.meshAgentsArchitectureNumbers) { obj.meshAgentsArchitectureNumbers[i].update = false; } }
        obj.updateMeshAgentsTable(function () {
            obj.updateMeshAgentInstallScripts();

            // Setup and start the web server
            obj.crypto.randomBytes(48, function (err, buf) {
                // Setup Mesh Multi-Server if needed
                obj.multiServer = require('./multiserver.js').CreateMultiServer(obj, obj.args);
                if (obj.multiServer != null) {
                    if ((obj.db.databaseType != 3) || (obj.db.changeStream != true)) { console.log("ERROR: Multi-server support requires use of MongoDB with ReplicaSet and ChangeStream enabled."); process.exit(0); return; }
                    obj.serverId = obj.multiServer.serverid;
                    for (var serverid in obj.config.peers.servers) { obj.peerConnectivityByNode[serverid] = {}; }
                }

                // If the server is set to "nousers", allow only loopback unless IP filter is set
                if ((obj.args.nousers == true) && (obj.args.userallowedip == null)) { obj.args.userallowedip = "::1,127.0.0.1"; }

                // Set the session length to 60 minutes if not set and set a random key if needed
                if ((obj.args.sessiontime != null) && ((typeof obj.args.sessiontime != 'number') || (obj.args.sessiontime < 1))) { delete obj.args.sessiontime; }
                if (!obj.args.sessionkey) { obj.args.sessionkey = buf.toString('hex').toUpperCase(); }

                // Create MQTT Broker to hook into webserver and mpsserver
                if ((typeof obj.config.settings.mqtt == 'object') && (typeof obj.config.settings.mqtt.auth == 'object') && (typeof obj.config.settings.mqtt.auth.keyid == 'string') && (typeof obj.config.settings.mqtt.auth.key == 'string')) { obj.mqttbroker = require("./mqttbroker.js").CreateMQTTBroker(obj, obj.db, obj.args); }

                // Start the web server and if needed, the redirection web server.
                obj.webserver = require('./webserver.js').CreateWebServer(obj, obj.db, obj.args, obj.certificates);
                if (obj.redirserver != null) { obj.redirserver.hookMainWebServer(obj.certificates); }

                // Setup the Intel AMT event handler
                obj.amtEventHandler = require('./amtevents.js').CreateAmtEventsHandler(obj);

                // Setup the Intel AMT local network scanner
                if (obj.args.wanonly != true) {
                    obj.amtScanner = require('./amtscanner.js').CreateAmtScanner(obj).start();
                    obj.meshScanner = require('./meshscanner.js').CreateMeshScanner(obj).start();
                }

                // Setup and start the MPS server
                obj.mpsserver = require('./mpsserver.js').CreateMpsServer(obj, obj.db, obj.args, obj.certificates);

                // Setup the Intel AMT manager
                if (obj.args.amtmanager !== false) {
                    obj.amtManager = require('./amtmanager.js').CreateAmtManager(obj);
                }

                // Setup and start the legacy swarm server
                if ((obj.certificates.swarmserver != null) && (obj.args.swarmport !== 0)) {
                    if (obj.args.swarmport == null) { obj.args.swarmport = 8080; }
                    obj.swarmserver = require('./swarmserver.js').CreateSwarmServer(obj, obj.db, obj.args, obj.certificates);
                }

                // Setup email server
                if ((obj.config.smtp != null) && (obj.config.smtp.host != null) && (obj.config.smtp.from != null)) {
                    obj.mailserver = require('./meshmail.js').CreateMeshMail(obj);
                    obj.mailserver.verify();
                    if (obj.args.lanonly == true) { addServerWarning("SMTP server has limited use in LAN mode."); }
                }

                // Setup SMS gateway
                if (config.sms != null) {
                    obj.smsserver = require('./meshsms.js').CreateMeshSMS(obj);
                    if ((obj.smsserver != null) && (obj.args.lanonly == true)) { addServerWarning("SMS gateway has limited use in LAN mode."); }
                }

                // Start periodic maintenance
                obj.maintenanceTimer = setInterval(obj.maintenanceActions, 1000 * 60 * 60); // Run this every hour

                // Dispatch an event that the server is now running
                obj.DispatchEvent(['*'], obj, { etype: 'server', action: 'started', msg: 'Server started' });

                // Plugin hook. Need to run something at server startup? This is the place.
                if (obj.pluginHandler) { obj.pluginHandler.callHook('server_startup'); }
                
                // Setup the login cookie encryption key
                if ((obj.config) && (obj.config.settings) && (typeof obj.config.settings.logincookieencryptionkey == 'string')) {
                    // We have a string, hash it and use that as a key
                    try { obj.loginCookieEncryptionKey = Buffer.from(obj.config.settings.logincookieencryptionkey, 'hex'); } catch (ex) { }
                    if ((obj.loginCookieEncryptionKey == null) || (obj.loginCookieEncryptionKey.length != 80)) { addServerWarning("Invalid \"LoginCookieEncryptionKey\" in config.json."); obj.loginCookieEncryptionKey = null; }
                }

                // Login cookie encryption key not set, use one from the database
                if (obj.loginCookieEncryptionKey == null) {
                    obj.db.Get('LoginCookieEncryptionKey', function (err, docs) {
                        if ((docs != null) && (docs.length > 0) && (docs[0].key != null) && (obj.args.logintokengen == null) && (docs[0].key.length >= 160)) {
                            obj.loginCookieEncryptionKey = Buffer.from(docs[0].key, 'hex');
                        } else {
                            obj.loginCookieEncryptionKey = obj.generateCookieKey(); obj.db.Set({ _id: 'LoginCookieEncryptionKey', key: obj.loginCookieEncryptionKey.toString('hex'), time: Date.now() });
                        }
                    });
                }

                // Load the invitation link encryption key from the database
                obj.db.Get('InvitationLinkEncryptionKey', function (err, docs) {
                    if ((docs != null) && (docs.length > 0) && (docs[0].key != null) && (docs[0].key.length >= 160)) {
                        obj.invitationLinkEncryptionKey = Buffer.from(docs[0].key, 'hex');
                    } else {
                        obj.invitationLinkEncryptionKey = obj.generateCookieKey(); obj.db.Set({ _id: 'InvitationLinkEncryptionKey', key: obj.invitationLinkEncryptionKey.toString('hex'), time: Date.now() });
                    }
                });

                // Start collecting server stats every 5 minutes
                setInterval(function () {
                    obj.serverStatsCounter++;
                    var hours = 720; // Start with all events lasting 30 days.
                    if (((obj.serverStatsCounter) % 2) == 1) { hours = 3; } // Half of the event get removed after 3 hours.
                    else if ((Math.floor(obj.serverStatsCounter / 2) % 2) == 1) { hours = 8; } // Another half of the event get removed after 8 hours.
                    else if ((Math.floor(obj.serverStatsCounter / 4) % 2) == 1) { hours = 24; } // Another half of the event get removed after 24 hours.
                    else if ((Math.floor(obj.serverStatsCounter / 8) % 2) == 1) { hours = 48; } // Another half of the event get removed after 48 hours.
                    else if ((Math.floor(obj.serverStatsCounter / 16) % 2) == 1) { hours = 72; } // Another half of the event get removed after 72 hours.
                    var expire = new Date();
                    expire.setTime(expire.getTime() + (60 * 60 * 1000 * hours));

                    var data = {
                        time: new Date(),
                        expire: expire,
                        mem: process.memoryUsage(),
                        //cpu: process.cpuUsage(),
                        conn: {
                            ca: Object.keys(obj.webserver.wsagents).length,
                            cu: Object.keys(obj.webserver.wssessions).length,
                            us: Object.keys(obj.webserver.wssessions2).length,
                            rs: obj.webserver.relaySessionCount
                        }
                    };
                    if (obj.mpsserver != null) {
                        data.conn.am = 0;
                        for (var i in obj.mpsserver.ciraConnections) { data.conn.am += obj.mpsserver.ciraConnections[i].length; }
                    }
                    if (obj.firstStats === true) { delete obj.firstStats; data.first = true; }
                    obj.db.SetServerStats(data); // Save the stats to the database
                    obj.DispatchEvent(['*'], obj, { action: 'servertimelinestats', data: data }); // Event the server stats
                }, 300000);

                obj.debug('main', "Server started");
                if (obj.args.nousers == true) { obj.updateServerState('nousers', '1'); }
                obj.updateServerState('state', "running");

                // Setup auto-backup defaults
                if (obj.config.settings.autobackup == null) { obj.config.settings.autobackup = { backupintervalhours: 24, keeplastdaysbackup: 10 }; }
                else if (obj.config.settings.autobackup === false) { delete obj.config.settings.autobackup; }

                // Setup users that can see all device groups
                if (typeof obj.config.settings.managealldevicegroups == 'string') { obj.config.settings.managealldevicegroups = obj.config.settings.managealldevicegroups.split(','); }
                else if (Array.isArray(obj.config.settings.managealldevicegroups) == false) { obj.config.settings.managealldevicegroups = []; }
                for (i in obj.config.domains) {
                    if (Array.isArray(obj.config.domains[i].managealldevicegroups)) {
                        for (var j in obj.config.domains[i].managealldevicegroups) {
                            if (typeof obj.config.domains[i].managealldevicegroups[j] == 'string') {
                                const u = 'user/' + i + '/' + obj.config.domains[i].managealldevicegroups[j];
                                if (obj.config.settings.managealldevicegroups.indexOf(u) == -1) { obj.config.settings.managealldevicegroups.push(u); }
                            }
                        }
                    }
                }
                obj.config.settings.managealldevicegroups.sort();

                // Start watchdog timer if needed
                // This is used to monitor if NodeJS is servicing IO correctly or getting held up a lot. Add this line to the settings section of config.json
                //   "watchDog": { "interval": 100, "timeout": 150 }
                // This will check every 100ms, if the timer is more than 150ms late, it will warn.
                if ((typeof config.settings.watchdog == 'object') && (typeof config.settings.watchdog.interval == 'number') && (typeof config.settings.watchdog.timeout == 'number') && (config.settings.watchdog.interval >= 50) && (config.settings.watchdog.timeout >= 50)) {
                    obj.watchdogtime = Date.now();
                    obj.watchdogmax = 0;
                    obj.watchdogmaxtime = null;
                    obj.watchdogtable = [];
                    obj.watchdog = setInterval(function () {
                        var now = Date.now(), delta = now - obj.watchdogtime - config.settings.watchdog.interval;
                        if (delta > obj.watchdogmax) { obj.watchdogmax = delta; obj.watchdogmaxtime = new Date().toLocaleString(); }
                        if (delta > config.settings.watchdog.timeout) {
                            const msg = obj.common.format("Watchdog timer timeout, {0}ms.", delta);
                            obj.watchdogtable.push(new Date().toLocaleString() + ', ' + delta + 'ms');
                            while (obj.watchdogtable.length > 10) { obj.watchdogtable.shift(); }
                            obj.debug('main', msg);
                            try {
                                var errlogpath = null;
                                if (typeof obj.args.mesherrorlogpath == 'string') { errlogpath = obj.path.join(obj.args.mesherrorlogpath, 'mesherrors.txt'); } else { errlogpath = obj.getConfigFilePath('mesherrors.txt'); }
                                obj.fs.appendFileSync(errlogpath, new Date().toLocaleString() + ': ' + msg + '\r\n');
                            } catch (ex) { console.log('ERROR: Unable to write to mesherrors.txt.'); }
                        }
                        obj.watchdogtime = now;
                    }, config.settings.watchdog.interval);
                    obj.debug('main', "Started watchdog timer.");
                }

            });
        });
    };

    // Refresh any certificate hashs from the reverse proxy
    obj.pendingProxyCertificatesRequests = 0;
    obj.lastProxyCertificatesRequest = null;
    obj.supportsProxyCertificatesRequest = false;
    obj.updateProxyCertificates = function (force) {
        if (force !== true) {
            if ((obj.pendingProxyCertificatesRequests > 0) || (obj.supportsProxyCertificatesRequest == false)) return;
            if ((obj.lastProxyCertificatesRequest != null) && ((Date.now() - obj.lastProxyCertificatesRequest) < 120000)) return; // Don't allow this call more than every 2 minutes.
            obj.lastProxyCertificatesRequest = Date.now();
        }

        // Load any domain web certificates
        for (var i in obj.config.domains) {
            if (obj.config.domains[i].certurl != null) {
                // Load web certs
                obj.pendingProxyCertificatesRequests++;
                var dnsname = obj.config.domains[i].dns;
                if ((dnsname == null) && (obj.config.settings.cert != null)) { dnsname = obj.config.settings.cert; }
                obj.certificateOperations.loadCertificate(obj.config.domains[i].certurl, dnsname, obj.config.domains[i], function (url, cert, xhostname, xdomain) {
                    obj.pendingProxyCertificatesRequests--;
                    if (cert != null) {
                        // Hash the entire cert
                        var hash = obj.crypto.createHash('sha384').update(Buffer.from(cert, 'binary')).digest('hex');
                        if (xdomain.certhash != hash) { // The certificate has changed.
                            xdomain.certkeyhash = hash;
                            xdomain.certhash = hash;

                            try {
                                // Decode a RSA certificate and hash the public key, if this is not RSA, skip this.
                                var forgeCert = obj.certificateOperations.forge.pki.certificateFromAsn1(obj.certificateOperations.forge.asn1.fromDer(cert));
                                xdomain.certkeyhash = obj.certificateOperations.forge.pki.getPublicKeyFingerprint(forgeCert.publicKey, { md: obj.certificateOperations.forge.md.sha384.create(), encoding: 'hex' });
                                //console.log('V1: ' + xdomain.certkeyhash);
                            } catch (ex) {
                                delete xdomain.certkeyhash;
                            }

                            if (obj.webserver) {
                                obj.webserver.webCertificateHashs[xdomain.id] = obj.webserver.webCertificateFullHashs[xdomain.id] = Buffer.from(hash, 'hex').toString('binary');
                                if (xdomain.certkeyhash != null) { obj.webserver.webCertificateHashs[xdomain.id] = Buffer.from(xdomain.certkeyhash, 'hex').toString('binary'); }

                                // Disconnect all agents with bad web certificates
                                for (var i in obj.webserver.wsagentsWithBadWebCerts) { obj.webserver.wsagentsWithBadWebCerts[i].close(1); }
                            }

                            console.log(obj.common.format("Loaded web certificate from \"{0}\", host: \"{1}\"", url, xhostname));
                            console.log(obj.common.format("  SHA384 cert hash: {0}", xdomain.certhash));
                            if ((xdomain.certkeyhash != null) && (xdomain.certhash != xdomain.certkeyhash)) { console.log(obj.common.format("  SHA384 key hash: {0}", xdomain.certkeyhash)); }
                        }
                    } else {
                        console.log(obj.common.format("Failed to load web certificate at: \"{0}\", host: \"{1}\"", url, xhostname));
                    }
                });
            }
        }
    }

    // Perform maintenance operations (called every hour)
    obj.maintenanceActions = function () {
        // Perform database maintenance
        obj.db.maintenance();

        // Clean up any temporary files
        var removeTime = new Date(Date.now()).getTime() - (30 * 60 * 1000); // 30 minutes
        var dir = obj.fs.readdir(obj.path.join(obj.filespath, 'tmp'), function (err, files) {
            if (err != null) return;
            for (var i in files) { try { const filepath = obj.path.join(obj.filespath, 'tmp', files[i]); if (obj.fs.statSync(filepath).mtime.getTime() < removeTime) { obj.fs.unlink(filepath, function () { }); } } catch (ex) { } }
        });

        // Check for self-update that targets a specific version
        if ((typeof obj.args.selfupdate == 'string') && (getCurrentVerion() === obj.args.selfupdate)) { obj.args.selfupdate = false; }

        // Check if we need to perform server self-update
        if ((obj.args.selfupdate) && (obj.serverSelfWriteAllowed == true)) {
            obj.db.getValueOfTheDay('performSelfUpdate', 1, function (performSelfUpdate) {
                if (performSelfUpdate.value > 0) {
                    performSelfUpdate.value--;
                    obj.db.Set(performSelfUpdate);
                    obj.getLatestServerVersion(function (currentVer, latestVer) { if (currentVer != latestVer) { obj.performServerUpdate(); return; } });
                } else {
                    checkAutobackup();
                }
            });
        } else {
            checkAutobackup();
        }
    };

    // Check if we need to perform an automatic backup
    function checkAutobackup() {
        if (obj.config.settings.autobackup && (typeof obj.config.settings.autobackup.backupintervalhours == 'number')) {
            obj.db.Get('LastAutoBackupTime', function (err, docs) {
                if (err != null) return;
                var lastBackup = 0, now = new Date().getTime();
                if (docs.length == 1) { lastBackup = docs[0].value; }
                var delta = now - lastBackup;
                if (delta > (obj.config.settings.autobackup.backupintervalhours * 60 * 60 * 1000)) {
                    // A new auto-backup is required.
                    obj.db.Set({ _id: 'LastAutoBackupTime', value: now }); // Save the current time in the database
                    obj.db.performBackup(); // Perform the backup
                }
            });
        }
    }

    // Stop the Meshcentral server
    obj.Stop = function (restoreFile) {
        // If the database is not setup, exit now.
        if (!obj.db) return;

        // Dispatch an event saying the server is now stopping
        obj.DispatchEvent(['*'], obj, { etype: 'server', action: 'stopped', msg: "Server stopped" });

        // Set all nodes to power state of unknown (0)
        obj.db.storePowerEvent({ time: new Date(), nodeid: '*', power: 0, s: 2 }, obj.multiServer, function () {  // s:2 indicates that the server is shutting down.
            if (restoreFile) {
                obj.debug('main', obj.common.format("Server stopped, updating settings: {0}", restoreFile));
                console.log("Updating settings folder...");

                var yauzl = require('yauzl');
                yauzl.open(restoreFile, { lazyEntries: true }, function (err, zipfile) {
                    if (err) throw err;
                    zipfile.readEntry();
                    zipfile.on('entry', function (entry) {
                        if (/\/$/.test(entry.fileName)) {
                            // Directory file names end with '/'.
                            // Note that entires for directories themselves are optional.
                            // An entry's fileName implicitly requires its parent directories to exist.
                            zipfile.readEntry();
                        } else {
                            // File entry
                            zipfile.openReadStream(entry, function (err, readStream) {
                                if (err) throw err;
                                readStream.on('end', function () { zipfile.readEntry(); });
                                var directory = obj.path.dirname(entry.fileName);
                                if (directory != '.') {
                                    directory = obj.getConfigFilePath(directory)
                                    if (obj.fs.existsSync(directory) == false) { obj.fs.mkdirSync(directory); }
                                }
                                //console.log('Extracting:', obj.getConfigFilePath(entry.fileName));
                                readStream.pipe(obj.fs.createWriteStream(obj.getConfigFilePath(entry.fileName)));
                            });
                        }
                    });
                    zipfile.on('end', function () { setTimeout(function () { obj.fs.unlinkSync(restoreFile); process.exit(123); }); });
                });
            } else {
                obj.debug('main', "Server stopped");
                process.exit(0);
            }
        });

        // Update the server state
        obj.updateServerState('state', "stopped");
    };
    
    // Event Dispatch
    obj.AddEventDispatch = function (ids, target) {
        obj.debug('dispatch', 'AddEventDispatch', ids);
        for (var i in ids) { var id = ids[i]; if (!obj.eventsDispatch[id]) { obj.eventsDispatch[id] = [target]; } else { obj.eventsDispatch[id].push(target); } }
    };
    obj.RemoveEventDispatch = function (ids, target) {
        obj.debug('dispatch', 'RemoveEventDispatch', id);
        for (var i in ids) { var id = ids[i]; if (obj.eventsDispatch[id]) { var j = obj.eventsDispatch[id].indexOf(target); if (j >= 0) { if (obj.eventsDispatch[id].length == 1) { delete obj.eventsDispatch[id]; } else { obj.eventsDispatch[id].splice(j, 1); } } } }
    };
    obj.RemoveEventDispatchId = function (id) {
        obj.debug('dispatch', 'RemoveEventDispatchId', id);
        if (obj.eventsDispatch[id] != null) { delete obj.eventsDispatch[id]; }
    };
    obj.RemoveAllEventDispatch = function (target) {
        obj.debug('dispatch', 'RemoveAllEventDispatch');
        for (var i in obj.eventsDispatch) { var j = obj.eventsDispatch[i].indexOf(target); if (j >= 0) { if (obj.eventsDispatch[i].length == 1) { delete obj.eventsDispatch[i]; } else { obj.eventsDispatch[i].splice(j, 1); } } }
    };
    obj.DispatchEvent = function (ids, source, event, fromPeerServer) {
        // If the database is not setup, exit now.
        if (!obj.db) return;

        // Send event to syslog if needed
        if (obj.syslog && event.msg) { obj.syslog.log(obj.syslog.LOG_INFO, event.msg); }
        if (obj.syslogjson) { obj.syslogjson.log(obj.syslogjson.LOG_INFO, JSON.stringify(event)); }

        obj.debug('dispatch', 'DispatchEvent', ids);
        if ((typeof event == 'object') && (!event.nolog)) {
            event.time = new Date();
            // The event we store is going to skip some of the fields so we don't store too much stuff in the database.
            var storeEvent = Object.assign({}, event);
            if (storeEvent.node) { delete storeEvent.node; } // Skip the "node" field. May skip more in the future.
            if (storeEvent.links) {
                // Escape "links" names that may have "." and/or "$"
                storeEvent.links = Object.assign({}, storeEvent.links);
                for (var i in storeEvent.links) { var ue = obj.common.escapeFieldName(i); if (ue !== i) { storeEvent.links[ue] = storeEvent.links[i]; delete storeEvent.links[i]; } }
            }
            storeEvent.ids = ids;
            obj.db.StoreEvent(storeEvent);
        }
        var targets = []; // List of targets we dispatched the event to, we don't want to dispatch to the same target twice.
        for (var j in ids) {
            var id = ids[j];
            if (obj.eventsDispatch[id]) {
                for (var i in obj.eventsDispatch[id]) {
                    if (targets.indexOf(obj.eventsDispatch[id][i]) == -1) { // Check if we already displatched to this target
                        targets.push(obj.eventsDispatch[id][i]);
                        try { obj.eventsDispatch[id][i].HandleEvent(source, event, ids, id); } catch (ex) {
                            console.log(ex, obj.eventsDispatch[id][i]);
                        }
                    }
                }
            }
        }
        if ((fromPeerServer == null) && (obj.multiServer != null) && ((typeof event != 'object') || (event.nopeers != 1))) { obj.multiServer.DispatchEvent(ids, source, event); }
    };

    // Get the connection state of a node
    obj.GetConnectivityState = function (nodeid) { return obj.connectivityByNode[nodeid]; };

    // Get the routing server id for a given node and connection type, can never be self.
    obj.GetRoutingServerId = function (nodeid, connectType) {
        if (obj.multiServer == null) return null;
        for (var serverid in obj.peerConnectivityByNode) {
            if (serverid == obj.serverId) continue;
            var state = obj.peerConnectivityByNode[serverid][nodeid];
            if ((state != null) && ((state.connectivity & connectType) != 0)) { return { serverid: serverid, meshid: state.meshid }; }
        }
        return null;
    };

    // Update the connection state of a node when in multi-server mode
    // Update obj.connectivityByNode using obj.peerConnectivityByNode for the list of nodes in argument
    obj.UpdateConnectivityState = function (nodeids) {
        for (var nodeid in nodeids) {
            var meshid = null, state = null, oldConnectivity = 0, oldPowerState = 0, newConnectivity = 0, newPowerState = 0;
            var oldState = obj.connectivityByNode[nodeid];
            if (oldState != null) { meshid = oldState.meshid; oldConnectivity = oldState.connectivity; oldPowerState = oldState.powerState; }
            for (var serverid in obj.peerConnectivityByNode) {
                var peerState = obj.peerConnectivityByNode[serverid][nodeid];
                if (peerState != null) {
                    if (state == null) {
                        // Copy the state
                        state = {};
                        newConnectivity = state.connectivity = peerState.connectivity;
                        newPowerState = state.powerState = peerState.powerState;
                        meshid = state.meshid = peerState.meshid;
                        //if (peerState.agentPower) { state.agentPower = peerState.agentPower; }
                        //if (peerState.ciraPower) { state.ciraPower = peerState.ciraPower; }
                        //if (peerState.amtPower) { state.amtPower = peerState.amtPower; }
                    } else {
                        // Merge the state
                        state.connectivity |= peerState.connectivity;
                        newConnectivity = state.connectivity;
                        if ((peerState.powerState != 0) && ((state.powerState == 0) || (peerState.powerState < state.powerState))) { newPowerState = state.powerState = peerState.powerState; }
                        meshid = state.meshid = peerState.meshid;
                        //if (peerState.agentPower) { state.agentPower = peerState.agentPower; }
                        //if (peerState.ciraPower) { state.ciraPower = peerState.ciraPower; }
                        //if (peerState.amtPower) { state.amtPower = peerState.amtPower; }
                    }
                }
            }
            obj.connectivityByNode[nodeid] = state;

            //console.log('xx', nodeid, meshid, newConnectivity, oldPowerState, newPowerState, oldPowerState);

            // Event any changes on this server only
            if ((newConnectivity != oldPowerState) || (newPowerState != oldPowerState)) {
                obj.DispatchEvent(obj.webserver.CreateNodeDispatchTargets(meshid, nodeid), obj, { action: 'nodeconnect', meshid: meshid, nodeid: nodeid, domain: nodeid.split('/')[1], conn: newConnectivity, pwr: newPowerState, nolog: 1, nopeers: 1 });
            }
        }
    };

    // Set the connectivity state of a node and setup the server so that messages can be routed correctly.
    // meshId: mesh identifier of format mesh/domain/meshidhex
    // nodeId: node identifier of format node/domain/nodeidhex
    // connectTime: time of connection, milliseconds elapsed since the UNIX epoch.
    // connectType: Bitmask, 1 = MeshAgent, 2 = Intel AMT CIRA, 4 = Intel AMT local, 8 = Intel AMT Relay, 16 = MQTT
    // powerState: Value, 0 = Unknown, 1 = S0 power on, 2 = S1 Sleep, 3 = S2 Sleep, 4 = S3 Sleep, 5 = S4 Hibernate, 6 = S5 Soft-Off, 7 = Present
    //var connectTypeStrings = ['', 'MeshAgent', 'Intel AMT CIRA', '', 'Intel AMT local', '', '', '', 'Intel AMT Relay', '', '', '', '', '', '', '', 'MQTT'];
    //var powerStateStrings = ['Unknown', 'Powered', 'Sleep', 'Sleep', 'Deep Sleep', 'Hibernating', 'Soft-Off', 'Present'];
    obj.SetConnectivityState = function (meshid, nodeid, connectTime, connectType, powerState, serverid) {
        //console.log('SetConnectivity for ' + nodeid.substring(0, 16) + ', Type: ' + connectTypeStrings[connectType] + ', Power: ' + powerStateStrings[powerState] + (serverid == null ? ('') : (', ServerId: ' + serverid)));
        if ((serverid == null) && (obj.multiServer != null)) { obj.multiServer.DispatchMessage({ action: 'SetConnectivityState', meshid: meshid, nodeid: nodeid, connectTime: connectTime, connectType: connectType, powerState: powerState }); }

        if (obj.multiServer == null) {
            // Single server mode

            // Change the node connection state
            var eventConnectChange = 0;
            var state = obj.connectivityByNode[nodeid];
            if (state) {
                // Change the connection in the node and mesh state lists
                if ((state.connectivity & connectType) == 0) { state.connectivity |= connectType; eventConnectChange = 1; }
                state.meshid = meshid;
            } else {
                // Add the connection to the node and mesh state list
                obj.connectivityByNode[nodeid] = state = { connectivity: connectType, meshid: meshid };
                eventConnectChange = 1;
            }

            // Set node power state
            if (connectType == 1) { state.agentPower = powerState; } else if (connectType == 2) { state.ciraPower = powerState; } else if (connectType == 4) { state.amtPower = powerState; }
            var powerState = 0, oldPowerState = state.powerState;
            if ((state.connectivity & 1) != 0) { powerState = state.agentPower; } else if ((state.connectivity & 2) != 0) { powerState = state.ciraPower; } else if ((state.connectivity & 4) != 0) { powerState = state.amtPower; }
            if ((state.powerState == null) || (state.powerState != powerState)) {
                state.powerState = powerState;
                eventConnectChange = 1;

                // Set new power state in database
                var record = { time: new Date(connectTime), nodeid: nodeid, power: powerState };
                if (oldPowerState != null) { record.oldPower = oldPowerState; }
                obj.db.storePowerEvent(record, obj.multiServer);
            }

            // Event the node connection change
            if (eventConnectChange == 1) {
                obj.DispatchEvent(obj.webserver.CreateNodeDispatchTargets(meshid, nodeid), obj, { action: 'nodeconnect', meshid: meshid, nodeid: nodeid, domain: nodeid.split('/')[1], conn: state.connectivity, pwr: state.powerState, ct: connectTime, nolog: 1, nopeers: 1 });
            }
        } else {
            // Multi server mode

            // Change the node connection state
            if (serverid == null) { serverid = obj.serverId; }
            if (obj.peerConnectivityByNode[serverid] == null) return; // Guard against unknown serverid's
            var state = obj.peerConnectivityByNode[serverid][nodeid];
            if (state) {
                // Change the connection in the node and mesh state lists
                if ((state.connectivity & connectType) == 0) { state.connectivity |= connectType; }
                state.meshid = meshid;
            } else {
                // Add the connection to the node and mesh state list
                obj.peerConnectivityByNode[serverid][nodeid] = state = { connectivity: connectType, meshid: meshid };
            }

            // Set node power state
            if (connectType == 1) { state.agentPower = powerState; } else if (connectType == 2) { state.ciraPower = powerState; } else if (connectType == 4) { state.amtPower = powerState; }
            var powerState = 0, oldPowerState = state.powerState;
            if ((state.connectivity & 1) != 0) { powerState = state.agentPower; } else if ((state.connectivity & 2) != 0) { powerState = state.ciraPower; } else if ((state.connectivity & 4) != 0) { powerState = state.amtPower; }
            if ((state.powerState == null) || (state.powerState != powerState)) {
                state.powerState = powerState;

                // Set new power state in database
                var record = { time: new Date(connectTime), nodeid: nodeid, power: powerState, server: obj.multiServer.serverid };
                if (oldPowerState != null) { record.oldPower = oldPowerState; }
                obj.db.storePowerEvent(record, obj.multiServer);
            }

            // Update the combined node state
            var x = {}; x[nodeid] = 1;
            obj.UpdateConnectivityState(x);
        }
    };

    // Clear the connectivity state of a node and setup the server so that messages can be routed correctly.
    // meshId: mesh identifier of format mesh/domain/meshidhex
    // nodeId: node identifier of format node/domain/nodeidhex
    // connectType: Bitmask, 1 = MeshAgent, 2 = Intel AMT CIRA, 3 = Intel AMT local.
    obj.ClearConnectivityState = function (meshid, nodeid, connectType, serverid) {
        //console.log('ClearConnectivity for ' + nodeid.substring(0, 16) + ', Type: ' + connectTypeStrings[connectType] + (serverid == null?(''):(', ServerId: ' + serverid)));
        if ((serverid == null) && (obj.multiServer != null)) { obj.multiServer.DispatchMessage({ action: 'ClearConnectivityState', meshid: meshid, nodeid: nodeid, connectType: connectType }); }

        if (obj.multiServer == null) {
            // Single server mode
            var eventConnectChange = 0;

            // Remove the agent connection from the nodes connection list
            var state = obj.connectivityByNode[nodeid];
            if (state == null) return;

            if ((state.connectivity & connectType) != 0) {
                state.connectivity -= connectType;

                // If the node is completely disconnected, clean it up completely
                if (state.connectivity == 0) { delete obj.connectivityByNode[nodeid]; }
                eventConnectChange = 1;
            }

            // Clear node power state
            var oldPowerState = state.powerState, powerState = 0;
            if (connectType == 1) { state.agentPower = 0; } else if (connectType == 2) { state.ciraPower = 0; } else if (connectType == 4) { state.amtPower = 0; }
            if ((state.connectivity & 1) != 0) { powerState = state.agentPower; } else if ((state.connectivity & 2) != 0) { powerState = state.ciraPower; } else if ((state.connectivity & 4) != 0) { powerState = state.amtPower; }
            if ((state.powerState == null) || (state.powerState != powerState)) {
                state.powerState = powerState;
                eventConnectChange = 1;

                // Set new power state in database
                obj.db.storePowerEvent({ time: new Date(), nodeid: nodeid, power: powerState, oldPower: oldPowerState }, obj.multiServer);
            }

            // Event the node connection change
            if (eventConnectChange == 1) { obj.DispatchEvent(obj.webserver.CreateNodeDispatchTargets(meshid, nodeid), obj, { action: 'nodeconnect', meshid: meshid, nodeid: nodeid, domain: nodeid.split('/')[1], conn: state.connectivity, pwr: state.powerState, nolog: 1, nopeers: 1 }); }
        } else {
            // Multi server mode

            // Remove the agent connection from the nodes connection list
            if (serverid == null) { serverid = obj.serverId; }
            if (obj.peerConnectivityByNode[serverid] == null) return; // Guard against unknown serverid's
            var state = obj.peerConnectivityByNode[serverid][nodeid];
            if (state == null) return;

            // If existing state exist, remove this connection
            if ((state.connectivity & connectType) != 0) {
                state.connectivity -= connectType; // Remove one connectivity mode

                // If the node is completely disconnected, clean it up completely
                if (state.connectivity == 0) { delete obj.peerConnectivityByNode[serverid][nodeid]; state.powerState = 0; }
            }

            // Clear node power state
            if (connectType == 1) { state.agentPower = 0; } else if (connectType == 2) { state.ciraPower = 0; } else if (connectType == 4) { state.amtPower = 0; }
            var powerState = 0;
            if ((state.connectivity & 1) != 0) { powerState = state.agentPower; } else if ((state.connectivity & 2) != 0) { powerState = state.ciraPower; } else if ((state.connectivity & 4) != 0) { powerState = state.amtPower; }
            if ((state.powerState == null) || (state.powerState != powerState)) { state.powerState = powerState; }

            // Update the combined node state
            var x = {}; x[nodeid] = 1;
            obj.UpdateConnectivityState(x);
        }
    };

    // Escape a code string
    obj.escapeCodeString = function (str) {
        const escapeCodeStringTable = { '\'': '\\\'', '\"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
        var r = '', c, cr, table;
        for (var i = 0; i < str.length; i++) {
            c = str[i];
            table = escapeCodeStringTable[c];
            if (table != null) {
                r += table;
            } else {
                cr = c.charCodeAt(0);
                if ((cr >= 32) && (cr <= 127)) { r += c; }
            }
        }
        return r;
    }

    // Update the default mesh core
    obj.updateMeshCore = function (func) {
        // Figure out where meshcore.js is
        var meshcorePath = obj.datapath;
        if (obj.fs.existsSync(obj.path.join(meshcorePath, 'meshcore.js')) == false) {
            meshcorePath = obj.path.join(__dirname, 'agents');
            if (obj.fs.existsSync(obj.path.join(meshcorePath, 'meshcore.js')) == false) {
                obj.defaultMeshCores = obj.defaultMeshCoresHash = { }; if (func != null) { func(false); } // meshcore.js not found
            }
        }

        // Read meshcore.js and all .js files in the modules folder.
        var meshCore = null, modulesDir = null;
        const modulesAdd = {
            'windows-amt': ['var addedModules = [];\r\n'],
            'linux-amt': ['var addedModules = [];\r\n'],
            'linux-noamt': ['var addedModules = [];\r\n']
        };

        // Read the recovery core if present
        var meshRecoveryCore = null;
        if (obj.fs.existsSync(obj.path.join(__dirname, 'agents', 'recoverycore.js')) == true) {
            try { meshRecoveryCore = obj.fs.readFileSync(obj.path.join(__dirname, 'agents', 'recoverycore.js')).toString(); } catch (ex) { }
            if (meshRecoveryCore != null) {
                modulesAdd['windows-recovery'] = ['var addedModules = [];\r\n'];
                modulesAdd['linux-recovery'] = ['var addedModules = [];\r\n'];
            }
        }

        // Read the agent recovery core if present
        var meshAgentRecoveryCore = null;
        if (obj.fs.existsSync(obj.path.join(__dirname, 'agents', 'meshcore_diagnostic.js')) == true) {
            try { meshAgentRecoveryCore = obj.fs.readFileSync(obj.path.join(__dirname, 'agents', 'meshcore_diagnostic.js')).toString(); } catch (ex) { }
            if (meshAgentRecoveryCore != null) {
                modulesAdd['windows-agentrecovery'] = ['var addedModules = [];\r\n'];
                modulesAdd['linux-agentrecovery'] = ['var addedModules = [];\r\n'];
            }
        }

        if (obj.args.minifycore !== false) { try { meshCore = obj.fs.readFileSync(obj.path.join(meshcorePath, 'meshcore.min.js')).toString(); } catch (e) { } } // Favor minified meshcore if present.
        if (meshCore == null) { try { meshCore = obj.fs.readFileSync(obj.path.join(meshcorePath, 'meshcore.js')).toString(); } catch (e) { } } // Use non-minified meshcore.
        if (meshCore != null) {
            var moduleDirPath = null;
            if (obj.args.minifycore !== false) { try { moduleDirPath = obj.path.join(meshcorePath, 'modules_meshcore_min'); modulesDir = obj.fs.readdirSync(moduleDirPath); } catch (e) { } } // Favor minified modules if present.
            if (modulesDir == null) { try { moduleDirPath = obj.path.join(meshcorePath, 'modules_meshcore'); modulesDir = obj.fs.readdirSync(moduleDirPath); } catch (e) { } } // Use non-minified mofules.
            if (modulesDir != null) {
                for (var i in modulesDir) {
                    if (modulesDir[i].toLowerCase().endsWith('.js')) {
                        var moduleName = modulesDir[i].substring(0, modulesDir[i].length - 3);
                        if (moduleName.endsWith('.min')) { moduleName = moduleName.substring(0, moduleName.length - 4); } // Remove the ".min" for ".min.js" files.
                        var moduleData = [ 'try { addModule("', moduleName, '", "', obj.escapeCodeString(obj.fs.readFileSync(obj.path.join(moduleDirPath, modulesDir[i])).toString('binary')), '"); addedModules.push("', moduleName, '"); } catch (e) { }\r\n' ];

                        // Merge this module
                        // NOTE: "smbios" module makes some non-AI Linux segfault, only include for IA platforms.
                        if (moduleName.startsWith('amt-') || (moduleName == 'smbios')) {
                            // Add to IA / Intel AMT cores only
                            modulesAdd['windows-amt'].push(...moduleData);
                            modulesAdd['linux-amt'].push(...moduleData);
                        } else if (moduleName.startsWith('win-')) {
                            // Add to Windows cores only
                            modulesAdd['windows-amt'].push(...moduleData);
                        } else if (moduleName.startsWith('linux-')) {
                            // Add to Linux cores only
                            modulesAdd['linux-amt'].push(...moduleData);
                            modulesAdd['linux-noamt'].push(...moduleData);
                        } else {
                            // Add to all cores
                            modulesAdd['windows-amt'].push(...moduleData);
                            modulesAdd['linux-amt'].push(...moduleData);
                            modulesAdd['linux-noamt'].push(...moduleData);
                        }

                        // Merge this module to recovery modules if needed
                        if (modulesAdd['windows-recovery'] != null)
                        {
                            if ((moduleName == 'win-console') || (moduleName == 'win-message-pump') || (moduleName == 'win-terminal') || (moduleName == 'win-virtual-terminal'))
                            {
                                modulesAdd['windows-recovery'].push(...moduleData);
                            }
                        }

                        // Merge this module to agent recovery modules if needed
                        if (modulesAdd['windows-agentrecovery'] != null)
                        {
                            if ((moduleName == 'win-console') || (moduleName == 'win-message-pump') || (moduleName == 'win-terminal') || (moduleName == 'win-virtual-terminal'))
                            {
                                modulesAdd['windows-agentrecovery'].push(...moduleData);
                            }
                        }
                    }
                }
            }

            // Add plugins to cores
            if (obj.pluginHandler) { obj.pluginHandler.addMeshCoreModules(modulesAdd); }

            // Merge the cores and compute the hashes
            for (var i in modulesAdd) {
                if ((i == 'windows-recovery') || (i == 'linux-recovery')) {
                    obj.defaultMeshCores[i] = [obj.common.IntToStr(0), ...modulesAdd[i], meshRecoveryCore].join('');
                } else if ((i == 'windows-agentrecovery') || (i == 'linux-agentrecovery')) {
                    obj.defaultMeshCores[i] = [obj.common.IntToStr(0), ...modulesAdd[i], meshAgentRecoveryCore].join('');
                } else {
                    obj.defaultMeshCores[i] = [obj.common.IntToStr(0), ...modulesAdd[i], meshCore].join('');
                }
                obj.defaultMeshCoresHash[i] = obj.crypto.createHash('sha384').update(obj.defaultMeshCores[i]).digest("binary");
                obj.debug('main', 'Core module ' + i + ' is ' + obj.defaultMeshCores[i].length + ' bytes.');
                //console.log('Core module ' + i + ' is ' + obj.defaultMeshCores[i].length + ' bytes.'); // DEBUG, Print the core size
                //obj.fs.writeFile("C:\\temp\\" + i + ".js", obj.defaultMeshCores[i].substring(4)); // DEBUG, Write the core to file

                // Compress the mesh cores with DEFLATE
                var callback = function MeshCoreDeflateCb(err, buffer) { if (err == null) { obj.defaultMeshCoresDeflate[MeshCoreDeflateCb.i] = buffer; } }
                callback.i = i;
                require('zlib').deflate(obj.defaultMeshCores[i], { level: require('zlib').Z_BEST_COMPRESSION }, callback); 
            }
        }

        // We are done creating all the mesh cores.
        if (func != null) { func(true); }
    };

    // Update the default meshcmd
    obj.updateMeshCmdTimer = 'notset';
    obj.updateMeshCmd = function (func) {
        // Figure out where meshcmd.js is and read it.
        var meshCmd = null, meshcmdPath, moduleAdditions = ['var addedModules = [];\r\n'], moduleDirPath, modulesDir = null;
        if ((obj.args.minifycore !== false) && (obj.fs.existsSync(obj.path.join(obj.datapath, 'meshcmd.min.js')))) { meshcmdPath = obj.path.join(obj.datapath, 'meshcmd.min.js'); meshCmd = obj.fs.readFileSync(meshcmdPath).toString(); }
        else if (obj.fs.existsSync(obj.path.join(obj.datapath, 'meshcmd.js'))) { meshcmdPath = obj.path.join(obj.datapath, 'meshcmd.js'); meshCmd = obj.fs.readFileSync(meshcmdPath).toString(); }
        else if ((obj.args.minifycore !== false) && (obj.fs.existsSync(obj.path.join(__dirname, 'agents', 'meshcmd.min.js')))) { meshcmdPath = obj.path.join(__dirname, 'agents', 'meshcmd.min.js'); meshCmd = obj.fs.readFileSync(meshcmdPath).toString(); }
        else if (obj.fs.existsSync(obj.path.join(__dirname, 'agents', 'meshcmd.js'))) { meshcmdPath = obj.path.join(__dirname, 'agents', 'meshcmd.js'); meshCmd = obj.fs.readFileSync(meshcmdPath).toString(); }
        else { obj.defaultMeshCmd = null; if (func != null) { func(false); } return; } // meshcmd.js not found
        meshCmd = meshCmd.replace("'***Mesh*Cmd*Version***'", '\'' + getCurrentVerion() + '\'');

        // Figure out where the modules_meshcmd folder is.
        if (obj.args.minifycore !== false) { try { moduleDirPath = obj.path.join(meshcmdPath, 'modules_meshcmd_min'); modulesDir = obj.fs.readdirSync(moduleDirPath); } catch (e) { } } // Favor minified modules if present.
        if (modulesDir == null) { try { moduleDirPath = obj.path.join(meshcmdPath, 'modules_meshcmd'); modulesDir = obj.fs.readdirSync(moduleDirPath); } catch (e) { } } // Use non-minified mofules.
        if (obj.args.minifycore !== false) { if (modulesDir == null) { try { moduleDirPath = obj.path.join(__dirname, 'agents', 'modules_meshcmd_min'); modulesDir = obj.fs.readdirSync(moduleDirPath); } catch (e) { } } } // Favor minified modules if present.
        if (modulesDir == null) { try { moduleDirPath = obj.path.join(__dirname, 'agents', 'modules_meshcmd'); modulesDir = obj.fs.readdirSync(moduleDirPath); } catch (e) { } } // Use non-minified mofules.

        // Read all .js files in the meshcmd modules folder.
        if (modulesDir != null) {
            for (var i in modulesDir) {
                if (modulesDir[i].toLowerCase().endsWith('.js')) {
                    // Merge this module
                    var moduleName = modulesDir[i].substring(0, modulesDir[i].length - 3);
                    if (moduleName.endsWith('.min')) { moduleName = moduleName.substring(0, moduleName.length - 4); } // Remove the ".min" for ".min.js" files.
                    moduleAdditions.push('try { addModule("', moduleName, '", "', obj.escapeCodeString(obj.fs.readFileSync(obj.path.join(moduleDirPath, modulesDir[i])).toString('binary')), '"); addedModules.push("', moduleName, '"); } catch (e) { }\r\n');
                }
            }
        }

        // Set the new default meshcmd.js
        moduleAdditions.push(meshCmd);
        obj.defaultMeshCmd = moduleAdditions.join('');
        //console.log('MeshCmd is ' + obj.defaultMeshCmd.length + ' bytes.'); // DEBUG, Print the merged meshcmd.js size
        //obj.fs.writeFile("C:\\temp\\meshcmd.js", obj.defaultMeshCmd.substring(4)); // DEBUG, Write merged meshcmd.js to file
        if (func != null) { func(true); }

        // Monitor for changes in meshcmd.js
        if (obj.updateMeshCmdTimer === 'notset') {
            obj.updateMeshCmdTimer = null;
            obj.fs.watch(meshcmdPath, function (eventType, filename) {
                if (obj.updateMeshCmdTimer != null) { clearTimeout(obj.updateMeshCmdTimer); obj.updateMeshCmdTimer = null; }
                obj.updateMeshCmdTimer = setTimeout(function () { obj.updateMeshCmd(); }, 5000);
            });
        }
    };

    // List of possible mesh agent install scripts
    var meshToolsList = {
        'MeshCentralRouter': { localname: 'MeshCentralRouter.exe', dlname: 'winrouter' },
        'MeshCentralAssistant': { localname: 'MeshCentralAssistant.exe', dlname: 'winassistant' }
    };

    // Update the list of available mesh agents
    obj.updateMeshTools = function () {
        for (var toolname in meshToolsList) {
            var toolpath = obj.path.join(__dirname, 'agents', meshToolsList[toolname].localname);
            var stream = null;
            try {
                stream = obj.fs.createReadStream(toolpath);
                stream.on('data', function (data) { this.hash.update(data, 'binary'); this.hashx += data.length; });
                stream.on('error', function (data) {
                    // If there is an error reading this file, make sure this agent is not in the agent table
                    if (obj.meshToolsBinaries[this.toolname] != null) { delete obj.meshToolsBinaries[this.toolname]; }
                });
                stream.on('end', function () {
                    // Add the agent to the agent table with all information and the hash
                    obj.meshToolsBinaries[this.toolname] = {};
                    obj.meshToolsBinaries[this.toolname].hash = this.hash.digest('hex');
                    obj.meshToolsBinaries[this.toolname].hashx = this.hashx;
                    obj.meshToolsBinaries[this.toolname].path = this.agentpath;
                    obj.meshToolsBinaries[this.toolname].dlname = this.dlname;
                    obj.meshToolsBinaries[this.toolname].url = 'https://' + obj.certificates.CommonName + ':' + ((typeof obj.args.aliasport == 'number') ? obj.args.aliasport : obj.args.port) + '/meshagents?meshaction=' + this.dlname;
                    var stats = null;
                    try { stats = obj.fs.statSync(this.agentpath); } catch (e) { }
                    if (stats != null) { obj.meshToolsBinaries[this.toolname].size = stats.size; }
                });
                stream.toolname = toolname;
                stream.agentpath = toolpath;
                stream.dlname = meshToolsList[toolname].dlname;
                stream.hash = obj.crypto.createHash('sha384', stream);
                stream.hashx = 0;
            } catch (e) { }
        }
    };

    // List of possible mesh agent install scripts
    var meshAgentsInstallScriptList = {
        1: { id: 1, localname: 'meshinstall-linux.sh', rname: 'meshinstall.sh', linux: true },
        2: { id: 2, localname: 'meshinstall-initd.sh', rname: 'meshagent', linux: true },
        5: { id: 5, localname: 'meshinstall-bsd-rcd.sh', rname: 'meshagent', linux: true },
        6: { id: 6, localname: 'meshinstall-linux.js', rname: 'meshinstall.js', linux: true }
    };

    // Update the list of available mesh agents
    obj.updateMeshAgentInstallScripts = function () {
        for (var scriptid in meshAgentsInstallScriptList) {
            var scriptpath = obj.path.join(__dirname, 'agents', meshAgentsInstallScriptList[scriptid].localname);
            var stream = null;
            try {
                stream = obj.fs.createReadStream(scriptpath);
                stream.xdata = '';
                stream.on('data', function (data) { this.hash.update(data, 'binary'); this.xdata += data; });
                stream.on('error', function (data) {
                    // If there is an error reading this file, make sure this agent is not in the agent table
                    if (obj.meshAgentInstallScripts[this.info.id] != null) { delete obj.meshAgentInstallScripts[this.info.id]; }
                });
                stream.on('end', function () {
                    // Add the agent to the agent table with all information and the hash
                    obj.meshAgentInstallScripts[this.info.id] = Object.assign({}, this.info);
                    obj.meshAgentInstallScripts[this.info.id].hash = this.hash.digest('hex');
                    obj.meshAgentInstallScripts[this.info.id].path = this.agentpath;
                    obj.meshAgentInstallScripts[this.info.id].data = this.xdata;
                    obj.meshAgentInstallScripts[this.info.id].url = 'https://' + obj.certificates.CommonName + ':' + ((typeof obj.args.aliasport == 'number') ? obj.args.aliasport : obj.args.port) + '/meshagents?script=' + this.info.id;
                    var stats = null;
                    try { stats = obj.fs.statSync(this.agentpath); } catch (e) { }
                    if (stats != null) { obj.meshAgentInstallScripts[this.info.id].size = stats.size; }

                    // Place Unit line breaks on Linux scripts if not already present.
                    if (obj.meshAgentInstallScripts[this.info.id].linux === true) { obj.meshAgentInstallScripts[this.info.id].data = obj.meshAgentInstallScripts[this.info.id].data.split('\r\n').join('\n') }
                });
                stream.info = meshAgentsInstallScriptList[scriptid];
                stream.agentpath = scriptpath;
                stream.hash = obj.crypto.createHash('sha384', stream);
            } catch (e) { }
        }
    };
    
    // List of possible mesh agents
    obj.meshAgentsArchitectureNumbers = {
        0: { id: 0, localname: 'Unknown', rname: 'meshconsole.exe', desc: 'Unknown agent', update: false, amt: true, platform: 'unknown', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        1: { id: 1, localname: 'MeshConsole.exe', rname: 'meshconsole32.exe', desc: 'Windows x86-32 console', update: true, amt: true, platform: 'win32', core: 'windows-amt', rcore: 'windows-recovery', arcore: 'windows-agentrecovery' },
        2: { id: 2, localname: 'MeshConsole64.exe', rname: 'meshconsole64.exe', desc: 'Windows x86-64 console', update: true, amt: true, platform: 'win32', core: 'windows-amt', rcore: 'windows-recovery', arcore: 'windows-agentrecovery' },
        3: { id: 3, localname: 'MeshService-signed.exe', rname: 'meshagent32.exe', desc: 'Windows x86-32 service', update: true, amt: true, platform: 'win32', core: 'windows-amt', rcore: 'windows-recovery', arcore: 'windows-agentrecovery' },
        4: { id: 4, localname: 'MeshService64-signed.exe', rname: 'meshagent64.exe', desc: 'Windows x86-64 service', update: true, amt: true, platform: 'win32', core: 'windows-amt', rcore: 'windows-recovery', arcore: 'windows-agentrecovery' },
        5: { id: 5, localname: 'meshagent_x86', rname: 'meshagent', desc: 'Linux x86-32', update: true, amt: true, platform: 'linux', core: 'linux-amt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        6: { id: 6, localname: 'meshagent_x86-64', rname: 'meshagent', desc: 'Linux x86-64', update: true, amt: true, platform: 'linux', core: 'linux-amt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        7: { id: 7, localname: 'meshagent_mips', rname: 'meshagent', desc: 'Linux MIPS', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        8: { id: 8, localname: 'MeshAgent-Linux-XEN-x86-32', rname: 'meshagent', desc: 'XEN x86-64', update: true, amt: false, platform: 'linux', core: 'linux-amt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        9: { id: 9, localname: 'meshagent_arm', rname: 'meshagent', desc: 'Linux ARM5', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        10: { id: 10, localname: 'MeshAgent-Linux-ARM-PlugPC', rname: 'meshagent', desc: 'Linux ARM PlugPC', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        11: { id: 11, localname: 'meshagent_osx-x86-32', rname: 'meshosx', desc: 'Apple OSX x86-32', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        12: { id: 12, localname: 'MeshAgent-Android-x86', rname: 'meshandroid', desc: 'Android x86-32', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        13: { id: 13, localname: 'meshagent_pogo', rname: 'meshagent', desc: 'Linux ARM PogoPlug', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        14: { id: 14, localname: 'MeshAgent-Android-APK', rname: 'meshandroid', desc: 'Android Market', update: false, amt: false, platform: 'android', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // Get this one from Google Play
        15: { id: 15, localname: 'meshagent_poky', rname: 'meshagent', desc: 'Linux Poky x86-32', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        16: { id: 16, localname: 'meshagent_osx-x86-64', rname: 'meshagent', desc: 'Apple OSX x86-64', update: true, amt: false, platform: 'osx', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        17: { id: 17, localname: 'MeshAgent-ChromeOS', rname: 'meshagent', desc: 'Google ChromeOS', update: false, amt: false, platform: 'chromeos', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // Get this one from Chrome store
        18: { id: 18, localname: 'meshagent_poky64', rname: 'meshagent', desc: 'Linux Poky x86-64', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        19: { id: 19, localname: 'meshagent_x86_nokvm', rname: 'meshagent', desc: 'Linux x86-32 NoKVM', update: true, amt: true, platform: 'linux', core: 'linux-amt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        20: { id: 20, localname: 'meshagent_x86-64_nokvm', rname: 'meshagent', desc: 'Linux x86-64 NoKVM', update: true, amt: true, platform: 'linux', core: 'linux-amt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        21: { id: 21, localname: 'MeshAgent-WinMinCore-Console-x86-32.exe', rname: 'meshagent.exe', desc: 'Windows MinCore Console x86-32', update: true, amt: false, platform: 'win32', core: 'windows-amt', rcore: 'windows-recovery', arcore: 'windows-agentrecovery' },
        22: { id: 22, localname: 'MeshAgent-WinMinCore-Service-x86-64.exe', rname: 'meshagent.exe', desc: 'Windows MinCore Service x86-32', update: true, amt: false, platform: 'win32', core: 'windows-amt', rcore: 'windows-recovery', arcore: 'windows-agentrecovery' },
        23: { id: 23, localname: 'MeshAgent-NodeJS', rname: 'meshagent', desc: 'NodeJS', update: false, amt: false, platform: 'node', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // Get this one from NPM
        24: { id: 24, localname: 'meshagent_arm-linaro', rname: 'meshagent', desc: 'Linux ARM Linaro', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' },
        25: { id: 25, localname: 'meshagent_armhf', rname: 'meshagent', desc: 'Linux ARM - HardFloat', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // "armv6l" and "armv7l"
        26: { id: 26, localname: 'meshagent_arm64', rname: 'meshagent', desc: 'Linux ARMv8-64', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // "aarch64"
        27: { id: 27, localname: 'meshagent_armhf2', rname: 'meshagent', desc: 'Linux ARM - HardFloat', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // Raspbian 7 2015-02-02 for old Raspberry Pi.
        28: { id: 28, localname: 'meshagent_mips24kc', rname: 'meshagent', desc: 'Linux MIPS24KC (OpenWRT)', update: true, amt: false, platform: 'linux', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // MIPS Router with OpenWRT
        29: { id: 29, localname: 'meshagent_osx-arm-64', rname: 'meshagent', desc: 'Apple OSX ARM-64', update: true, amt: false, platform: 'osx', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // Apple Silicon
        30: { id: 30, localname: 'meshagent_freebsd_x86-64', rname: 'meshagent', desc: 'FreeBSD x86-64', update: true, amt: false, platform: 'freebsd', core: 'linux-noamt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // FreeBSD x64
        10003: { id: 3, localname: 'MeshService.exe', rname: 'meshagent.exe', desc: 'Windows x86-32 service', update: true, amt: true, platform: 'win32', core: 'windows-amt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' }, // Unsigned version of the Windows MeshAgent x86
        10004: { id: 4, localname: 'MeshService64.exe', rname: 'meshagent.exe', desc: 'Windows x86-64 service', update: true, amt: true, platform: 'win32', core: 'windows-amt', rcore: 'linux-recovery', arcore: 'linux-agentrecovery' } // Unsigned version of the Windows MeshAgent x64
    };

    // Update the list of available mesh agents
    obj.updateMeshAgentsTable = function (func) {
        var archcount = 0;
        for (var archid in obj.meshAgentsArchitectureNumbers) {
            var agentpath = obj.path.join(__dirname, 'agents', obj.meshAgentsArchitectureNumbers[archid].localname);

            // Fetch all the agent binary information
            var stats = null;
            try { stats = obj.fs.statSync(agentpath); } catch (e) { }
            if ((stats != null)) {
                // If file exists
                archcount++;
                obj.meshAgentBinaries[archid] = Object.assign({}, obj.meshAgentsArchitectureNumbers[archid]);
                obj.meshAgentBinaries[archid].path = agentpath;
                obj.meshAgentBinaries[archid].url = 'http://' + obj.certificates.CommonName + ':' + ((typeof obj.args.aliasport == 'number') ? obj.args.aliasport : obj.args.port) + '/meshagents?id=' + archid;
                obj.meshAgentBinaries[archid].size = stats.size;

                // If this is a windows binary, pull binary information
                if (obj.meshAgentsArchitectureNumbers[archid].platform == 'win32') {
                    try { obj.meshAgentBinaries[archid].pe = obj.exeHandler.parseWindowsExecutable(agentpath); } catch (e) { }
                }

                // If agents must be stored in RAM or if this is a Windows 32/64 agent, load the agent in RAM.
                if ((obj.args.agentsinram === true) || (((archid == 3) || (archid == 4)) && (obj.args.agentsinram !== false))) {
                    if ((archid == 3) || (archid == 4)) {
                        // Load the agent with a random msh added to it.
                        var outStream = new require('stream').Duplex();
                        outStream.meshAgentBinary = obj.meshAgentBinaries[archid];
                        outStream.meshAgentBinary.randomMsh = Buffer.from(obj.crypto.randomBytes(64), 'binary').toString('base64');
                        outStream.bufferList = [];
                        outStream._write = function (chunk, encoding, callback) { this.bufferList.push(chunk); if (callback) callback(); }; // Append the chuck.
                        outStream._read = function (size) { }; // Do nothing, this is not going to be called.
                        outStream.on('finish', function () {
                            // Merge all chunks
                            this.meshAgentBinary.data = Buffer.concat(this.bufferList);
                            this.meshAgentBinary.size = this.meshAgentBinary.data.length;
                            delete this.bufferList;

                            // Compress the agent using ZIP
                            var archive = require('archiver')('zip', { level: 9 }); // Sets the compression method.

                            const onZipData = function onZipData(buffer) { onZipData.x.zacc.push(buffer); }
                            const onZipEnd = function onZipEnd() {
                                // Concat all the buffer for create compressed zip agent
                                var concatData = Buffer.concat(onZipData.x.zacc);
                                delete onZipData.x.zacc;

                                // Hash the compressed binary
                                var hash = obj.crypto.createHash('sha384').update(concatData);
                                onZipData.x.zhash = hash.digest('binary');
                                onZipData.x.zhashhex = Buffer.from(onZipData.x.zhash, 'binary').toString('hex');

                                // Set the agent
                                onZipData.x.zdata = concatData;
                                onZipData.x.zsize = concatData.length;
                            }
                            const onZipError = function onZipError() { delete onZipData.x.zacc; }
                            this.meshAgentBinary.zacc = [];
                            onZipData.x = this.meshAgentBinary;
                            onZipEnd.x = this.meshAgentBinary;
                            onZipError.x = this.meshAgentBinary;
                            archive.on('data', onZipData);
                            archive.on('end', onZipEnd);
                            archive.on('error', onZipError);
                            archive.append(this.meshAgentBinary.data, { name: 'meshagent' });
                            archive.finalize();
                        })
                        obj.exeHandler.streamExeWithMeshPolicy(
                            {
                                platform: 'win32',
                                sourceFileName: agentpath,
                                destinationStream: outStream,
                                randomPolicy: true, // Indicates that the msh policy is random data.
                                msh: outStream.meshAgentBinary.randomMsh,
                                peinfo: obj.meshAgentBinaries[archid].pe
                            });
                    } else {
                        // Load the agent as-is
                        obj.meshAgentBinaries[archid].data = obj.fs.readFileSync(agentpath);

                        // Compress the agent using ZIP
                        var archive = require('archiver')('zip', { level: 9 }); // Sets the compression method.

                        const onZipData = function onZipData(buffer) { onZipData.x.zacc.push(buffer); }
                        const onZipEnd = function onZipEnd() {
                            // Concat all the buffer for create compressed zip agent
                            var concatData = Buffer.concat(onZipData.x.zacc);
                            delete onZipData.x.zacc;

                            // Hash the compressed binary
                            var hash = obj.crypto.createHash('sha384').update(concatData);
                            onZipData.x.zhash = hash.digest('binary');
                            onZipData.x.zhashhex = Buffer.from(onZipData.x.zhash, 'binary').toString('hex');

                            // Set the agent
                            onZipData.x.zdata = concatData;
                            onZipData.x.zsize = concatData.length;

                            console.log('Packed', onZipData.x.size, onZipData.x.zsize);
                        }
                        const onZipError = function onZipError() { delete onZipData.x.zacc; }
                        obj.meshAgentBinaries[archid].zacc = [];
                        onZipData.x = obj.meshAgentBinaries[archid];
                        onZipEnd.x = obj.meshAgentBinaries[archid];
                        onZipError.x = obj.meshAgentBinaries[archid];
                        archive.on('data', onZipData);
                        archive.on('end', onZipEnd);
                        archive.on('error', onZipError);
                        archive.append(obj.meshAgentBinaries[archid].data, { name: 'meshagent' });
                        archive.finalize();
                    }
                }

                // Hash the binary
                var hashStream = obj.crypto.createHash('sha384');
                hashStream.archid = archid;
                hashStream.on('data', function (data) {
                    obj.meshAgentBinaries[this.archid].hash = data.toString('binary');
                    obj.meshAgentBinaries[this.archid].hashhex = data.toString('hex');
                    if ((--archcount == 0) && (func != null)) { func(); }
                });
                var options = { sourcePath: agentpath, targetStream: hashStream, platform: obj.meshAgentsArchitectureNumbers[archid].platform };
                if (obj.meshAgentBinaries[archid].pe != null) { options.peinfo = obj.meshAgentBinaries[archid].pe; }
                obj.exeHandler.hashExecutableFile(options);
            }
        }
        if ((obj.meshAgentBinaries[3] == null) && (obj.meshAgentBinaries[10003] != null)) { obj.meshAgentBinaries[3] = obj.meshAgentBinaries[10003]; } // If only the unsigned windows binaries are present, use them.
        if ((obj.meshAgentBinaries[4] == null) && (obj.meshAgentBinaries[10004] != null)) { obj.meshAgentBinaries[4] = obj.meshAgentBinaries[10004]; } // If only the unsigned windows binaries are present, use them.
    };

    // Generate a time limited user login token
    obj.getLoginToken = function (userid, func) {
        if ((userid == null) || (typeof userid != 'string')) { func('Invalid userid.'); return; }
        var x = userid.split('/');
        if (x == null || x.length != 3 || x[0] != 'user') { func('Invalid userid.'); return; }
        obj.db.Get(userid, function (err, docs) {
            if (err != null || docs == null || docs.length == 0) {
                func('User ' + userid + ' not found.'); return;
            } else {
                // Load the login cookie encryption key from the database
                obj.db.Get('LoginCookieEncryptionKey', function (err, docs) {
                    if ((docs.length > 0) && (docs[0].key != null) && (obj.args.logintokengen == null) && (docs[0].key.length >= 160)) {
                        // Key is present, use it.
                        obj.loginCookieEncryptionKey = Buffer.from(docs[0].key, 'hex');
                        func(obj.encodeCookie({ u: userid, a: 3 }, obj.loginCookieEncryptionKey));
                    } else {
                        // Key is not present, generate one.
                        obj.loginCookieEncryptionKey = obj.generateCookieKey();
                        obj.db.Set({ _id: 'LoginCookieEncryptionKey', key: obj.loginCookieEncryptionKey.toString('hex'), time: Date.now() }, function () { func(obj.encodeCookie({ u: userid, a: 3 }, obj.loginCookieEncryptionKey)); });
                    }
                });
            }
        });
    };

    // Show the user login token generation key
    obj.showLoginTokenKey = function (func) {
        // Load the login cookie encryption key from the database
        obj.db.Get('LoginCookieEncryptionKey', function (err, docs) {
            if ((docs.length > 0) && (docs[0].key != null) && (obj.args.logintokengen == null) && (docs[0].key.length >= 160)) {
                // Key is present, use it.
                func(docs[0].key);
            } else {
                // Key is not present, generate one.
                obj.loginCookieEncryptionKey = obj.generateCookieKey();
                obj.db.Set({ _id: 'LoginCookieEncryptionKey', key: obj.loginCookieEncryptionKey.toString('hex'), time: Date.now() }, function () { func(obj.loginCookieEncryptionKey.toString('hex')); });
            }
        });
    };

    // Generate a cryptographic key used to encode and decode cookies
    obj.generateCookieKey = function () {
        return Buffer.from(obj.crypto.randomBytes(80), 'binary');
        //return Buffer.alloc(80, 0); // Sets the key to zeros, debug only.
    };

    // Encode an object as a cookie using a key using AES-GCM. (key must be 32 bytes or more)
    obj.encodeCookie = function (o, key) {
        try {
            if (key == null) { key = obj.serverKey; }
            o.time = Math.floor(Date.now() / 1000); // Add the cookie creation time
            const iv = Buffer.from(obj.crypto.randomBytes(12), 'binary'), cipher = obj.crypto.createCipheriv('aes-256-gcm', key.slice(0, 32), iv);
            const crypted = Buffer.concat([cipher.update(JSON.stringify(o), 'utf8'), cipher.final()]);
            var r = Buffer.concat([iv, cipher.getAuthTag(), crypted]).toString(obj.args.cookieencoding ? obj.args.cookieencoding : 'base64').replace(/\+/g, '@').replace(/\//g, '$');
            obj.debug('cookie', 'Encoded AESGCM cookie: ' + JSON.stringify(o));
            return r;
        } catch (ex) { obj.debug('cookie', 'ERR: Failed to encode AESGCM cookie due to exception: ' + ex); return null; }
    };

    // Decode a cookie back into an object using a key using AES256-GCM or AES128-CBC/HMAC-SHA386. Return null if it's not a valid cookie. (key must be 32 bytes or more)
    obj.decodeCookie = function (cookie, key, timeout) {
        var r = obj.decodeCookieAESGCM(cookie, key, timeout);
        if (r == null) { r = obj.decodeCookieAESSHA(cookie, key, timeout); }
        if ((r == null) && (obj.args.cookieencoding == null) && (cookie.length != 64) && ((cookie == cookie.toLowerCase()) || (cookie == cookie.toUpperCase()))) {
            obj.debug('cookie', 'Upper/Lowercase cookie, try "CookieEncoding":"hex" in settings section of config.json.');
            console.log('Upper/Lowercase cookie, try "CookieEncoding":"hex" in settings section of config.json.');
        }
        if ((r != null) && (typeof r.once == 'string') && (r.once.length > 0)) {
            // This cookie must only be used once.
            if (timeout == null) { timeout = 2; }
            if (obj.cookieUseOnceTable[r.once] == null) {
                const ctimeout = (((r.expire) == null || (typeof r.expire != 'number')) ? (r.time + ((timeout + 3) * 60000)) : (r.time + ((r.expire + 3) * 60000)));

                // Store the used cookie in RAM
                obj.cookieUseOnceTable[r.once] = ctimeout;

                // Store the used cookie in the database
                // TODO

                // Send the used cookie to peer servers
                // TODO

                // Clean up the used table
                if (++obj.cookieUseOnceTableCleanCounter > 20) {
                    const now = Date.now();
                    for (var i in obj.cookieUseOnceTable) { if (obj.cookieUseOnceTable[i] < now) { delete obj.cookieUseOnceTable[i]; } }
                    obj.cookieUseOnceTableCleanCounter = 0;
                }
            } else { return null; }
        }
        return r;
    }

    // Decode a cookie back into an object using a key using AES256-GCM. Return null if it's not a valid cookie. (key must be 32 bytes or more)
    obj.decodeCookieAESGCM = function (cookie, key, timeout) {
        try {
            if (key == null) { key = obj.serverKey; }
            cookie = Buffer.from(cookie.replace(/\@/g, '+').replace(/\$/g, '/'), obj.args.cookieencoding ? obj.args.cookieencoding : 'base64');
            const decipher = obj.crypto.createDecipheriv('aes-256-gcm', key.slice(0, 32), cookie.slice(0, 12));
            decipher.setAuthTag(cookie.slice(12, 28));
            const o = JSON.parse(decipher.update(cookie.slice(28), 'binary', 'utf8') + decipher.final('utf8'));
            if ((o.time == null) || (o.time == null) || (typeof o.time != 'number')) { obj.debug('cookie', 'ERR: Bad cookie due to invalid time'); return null; }
            o.time = o.time * 1000; // Decode the cookie creation time
            o.dtime = Date.now() - o.time; // Decode how long ago the cookie was created (in milliseconds)
            if ((o.expire) == null || (typeof o.expire != 'number')) {
                // Use a fixed cookie expire time
                if (timeout == null) { timeout = 2; }
                if ((o.dtime > (timeout * 60000)) || (o.dtime < -30000)) { obj.debug('cookie', 'ERR: Bad cookie due to timeout'); return null; } // The cookie is only valid 120 seconds, or 30 seconds back in time (in case other server's clock is not quite right)
            } else {
                // An expire time is included in the cookie (in minutes), use this.
                if ((o.expire !== 0) && ((o.dtime > (o.expire * 60000)) || (o.dtime < -30000))) { obj.debug('cookie', 'ERR: Bad cookie due to timeout'); return null; } // The cookie is only valid 120 seconds, or 30 seconds back in time (in case other server's clock is not quite right)
            }
            obj.debug('cookie', 'Decoded AESGCM cookie: ' + JSON.stringify(o));
            return o;
        } catch (ex) { obj.debug('cookie', 'ERR: Bad AESGCM cookie due to exception: ' + ex); return null; }
    };

    // Decode a cookie back into an object using a key using AES256 / HMAC-SHA386. Return null if it's not a valid cookie. (key must be 80 bytes or more)
    // We do this because poor .NET does not support AES256-GCM.
    obj.decodeCookieAESSHA = function (cookie, key, timeout) {
        try {
            if (key == null) { key = obj.serverKey; }
            if (key.length < 80) { return null; }
            cookie = Buffer.from(cookie.replace(/\@/g, '+').replace(/\$/g, '/'), obj.args.cookieencoding ? obj.args.cookieencoding : 'base64');
            const decipher = obj.crypto.createDecipheriv('aes-256-cbc', key.slice(48, 80), cookie.slice(0, 16));
            const rawmsg = decipher.update(cookie.slice(16), 'binary', 'binary') + decipher.final('binary');
            const hmac = obj.crypto.createHmac('sha384', key.slice(0, 48));
            hmac.update(rawmsg.slice(48));
            if (Buffer.compare(hmac.digest(), Buffer.from(rawmsg.slice(0, 48))) == false) { return null; }
            const o = JSON.parse(rawmsg.slice(48).toString('utf8'));
            if ((o.time == null) || (o.time == null) || (typeof o.time != 'number')) { obj.debug('cookie', 'ERR: Bad cookie due to invalid time'); return null; }
            o.time = o.time * 1000; // Decode the cookie creation time
            o.dtime = Date.now() - o.time; // Decode how long ago the cookie was created (in milliseconds)
            if ((o.expire) == null || (typeof o.expire != 'number')) {
                // Use a fixed cookie expire time
                if (timeout == null) { timeout = 2; }
                if ((o.dtime > (timeout * 60000)) || (o.dtime < -30000)) { obj.debug('cookie', 'ERR: Bad cookie due to timeout'); return null; } // The cookie is only valid 120 seconds, or 30 seconds back in time (in case other server's clock is not quite right)
            } else {
                // An expire time is included in the cookie (in minutes), use this.
                if ((o.expire !== 0) && ((o.dtime > (o.expire * 60000)) || (o.dtime < -30000))) { obj.debug('cookie', 'ERR: Bad cookie due to timeout'); return null; } // The cookie is only valid 120 seconds, or 30 seconds back in time (in case other server's clock is not quite right)
            }
            obj.debug('cookie', 'Decoded AESSHA cookie: ' + JSON.stringify(o));
            return o;
        } catch (ex) { obj.debug('cookie', 'ERR: Bad AESSHA cookie due to exception: ' + ex); return null; }
    };

    // Debug
    obj.debug = function (source, ...args) {
        // Send event to console
        if ((obj.debugSources != null) && ((obj.debugSources == '*') || (obj.debugSources.indexOf(source) >= 0))) { console.log(source.toUpperCase() + ':', ...args); }

        // Send event to log file
        if (obj.config.settings && obj.config.settings.log) {
            if (typeof obj.args.log == 'string') { obj.args.log = obj.args.log.split(','); }
            if (obj.args.log.indexOf(source) >= 0) {
                const d = new Date();
                if (obj.xxLogFile == null) {
                    try {
                        obj.xxLogFile = obj.fs.openSync(obj.getConfigFilePath('log.txt'), 'a+', 666);
                        obj.fs.writeSync(obj.xxLogFile, '---- Log start at ' + new Date().toLocaleString() + ' ----\r\n');
                        obj.xxLogDateStr = d.toLocaleDateString();
                    } catch (ex) { }
                }
                if (obj.xxLogFile != null) {
                    try {
                        if (obj.xxLogDateStr != d.toLocaleDateString()) { obj.xxLogDateStr = d.toLocaleDateString(); obj.fs.writeSync(obj.xxLogFile, '---- ' + d.toLocaleDateString() + ' ----\r\n'); }
                        obj.fs.writeSync(obj.xxLogFile, new Date().toLocaleTimeString() + ' - ' + source + ': ' + Array.prototype.slice.call(...args).join('') + '\r\n');
                    } catch (ex) { }
                }
            }
        }

        // Send the event to logged in administrators
        if ((obj.debugRemoteSources != null) && ((obj.debugRemoteSources == '*') || (obj.debugRemoteSources.indexOf(source) >= 0))) {
            var sendcount = 0;
            for (var sessionid in obj.webserver.wssessions2) {
                var ws = obj.webserver.wssessions2[sessionid];
                if ((ws != null) && (ws.userid != null)) {
                    var user = obj.webserver.users[ws.userid];
                    if ((user != null) && (user.siteadmin == 4294967295)) {
                        try { ws.send(JSON.stringify({ action: 'trace', source: source, args: args, time: Date.now() })); sendcount++; } catch (ex) { }
                    }
                }
            }
            if (sendcount == 0) { obj.debugRemoteSources = null; } // If there are no listeners, remove debug sources.
        }
    };

    // Update server state. Writes a server state file.
    var meshServerState = {};
    obj.updateServerState = function (name, val) {
        //console.log('updateServerState', name, val);
        try {
            if ((name != null) && (val != null)) {
                var changed = false;
                if ((name != null) && (meshServerState[name] != val)) { if ((val == null) && (meshServerState[name] != null)) { delete meshServerState[name]; changed = true; } else { if (meshServerState[name] != val) { meshServerState[name] = val; changed = true; } } }
                if (changed == false) return;
            }
            var r = 'time=' + Date.now() + '\r\n';
            for (var i in meshServerState) { r += (i + '=' + meshServerState[i] + '\r\n'); }
            try {
                obj.fs.writeFileSync(obj.getConfigFilePath('serverstate.txt'), r); // Try to write the server state, this may fail if we don't have permission.
            } catch (ex) { obj.serverSelfWriteAllowed = false; }
        } catch (ex) { } // Do nothing since this is not a critical feature.
    };
    
    // Logging funtions
    function logException(e) { e += ''; logErrorEvent(e); }
    function logInfoEvent(msg) { if (obj.servicelog != null) { obj.servicelog.info(msg); } console.log(msg); }
    function logWarnEvent(msg) { if (obj.servicelog != null) { obj.servicelog.warn(msg); } console.log(msg); }
    function logErrorEvent(msg) { if (obj.servicelog != null) { obj.servicelog.error(msg); } console.error(msg); }
    obj.getServerWarnings = function () { return serverWarnings; }
    obj.addServerWarning = function(msg, print) { serverWarnings.push(msg); if (print !== false) { console.log("WARNING: " + msg); } }

    // auth.log functions
    obj.authLog = function (server, msg) {
        if (typeof msg != 'string') return;
        if (obj.syslogauth != null) { try { obj.syslogauth.log(obj.syslogauth.LOG_INFO, msg); } catch (ex) { } }
        if (obj.authlogfile != null) { // Write authlog to file
            try {
                var d = new Date(), month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
                var msg = month + ' ' + d.getDate() + ' ' + obj.common.zeroPad(d.getHours(), 2) + ':' + obj.common.zeroPad(d.getMinutes(), 2) + ':' + d.getSeconds() + ' meshcentral ' + server + '[' + process.pid + ']: ' + msg + ((obj.platform == 'win32') ? '\r\n' : '\n');
                obj.fs.write(obj.authlogfile, msg, function (err, written, string) { });
            } catch (ex) { }
        }
    }

    // Return the path of a file into the meshcentral-data path
    obj.getConfigFilePath = function (filename) {
        if ((obj.config != null) && (obj.config.configfiles != null) && (obj.config.configfiles[filename] != null) && (typeof obj.config.configfiles[filename] == 'string')) {
            //console.log('getConfigFilePath(\"' + filename + '\") = ' + obj.config.configfiles[filename]);
            return obj.config.configfiles[filename];
        }
        //console.log('getConfigFilePath(\"' + filename + '\") = ' + obj.path.join(obj.datapath, filename));
        return obj.path.join(obj.datapath, filename);
    };

    return obj;
}

// Resolve a list of names, call back with list of failed resolves.
function checkResolveAll(names, func) {
    var dns = require('dns'), state = { func: func, count: names.length, err: null };
    for (var i in names) {
        dns.resolve(names[i], function (err, records) {
            if (err != null) { if (this.state.err == null) { this.state.err = [this.name]; } else { this.state.err.push(this.name); } }
            if (--this.state.count == 0) { this.state.func(this.state.err); }
        }.bind({ name: names[i], state: state }))
    }
}

// Return the server configuration
function getConfig(createSampleConfig) {
    // Figure out the datapath location
    var i, fs = require('fs'), path = require('path'), datapath = null;
    var args = require('minimist')(process.argv.slice(2));
    if ((__dirname.endsWith('/node_modules/meshcentral')) || (__dirname.endsWith('\\node_modules\\meshcentral')) || (__dirname.endsWith('/node_modules/meshcentral/')) || (__dirname.endsWith('\\node_modules\\meshcentral\\'))) {
        datapath = path.join(__dirname, '../../meshcentral-data');
    } else {
        datapath = path.join(__dirname, '../meshcentral-data');
    }
    if (args.datapath) { datapath = args.datapath; }
    try { fs.mkdirSync(datapath); } catch (e) { }

    // Read configuration file if present and change arguments.
    var config = {}, configFilePath = path.join(datapath, 'config.json');
    if (fs.existsSync(configFilePath)) {
        // Load and validate the configuration file
        try { config = require(configFilePath); } catch (e) { console.log('ERROR: Unable to parse ' + configFilePath + '.'); return null; }
        if (config.domains == null) { config.domains = {}; }
        for (i in config.domains) { if ((i.split('/').length > 1) || (i.split(' ').length > 1)) { console.log("ERROR: Error in config.json, domain names can't have spaces or /."); return null; } }
    } else {
        if (createSampleConfig === true) {
            // Copy the "sample-config.json" to give users a starting point
            var sampleConfigPath = path.join(__dirname, 'sample-config.json');
            if (fs.existsSync(sampleConfigPath)) { fs.createReadStream(sampleConfigPath).pipe(fs.createWriteStream(configFilePath)); }
        }
    }

    // Set the command line arguments to the config file if they are not present
    if (!config.settings) { config.settings = {}; }
    for (i in args) { config.settings[i] = args[i]; }

    // Lower case all keys in the config file
    try {
        require('./common.js').objKeysToLower(config, ['ldapoptions', 'defaultuserwebstate', 'forceduserwebstate']);
    } catch (ex) {
        console.log('CRITICAL ERROR: Unable to access the file \"./common.js\".\r\nCheck folder & file permissions.');
        process.exit();
    }

    return config;
}

// Check if a list of modules are present and install any missing ones
function InstallModules(modules, func) {
    var missingModules = [];
    if (modules.length > 0) {
        var dependencies = require('./package.json').dependencies;
        for (var i in modules) {
            // Modules may contain a version tag (foobar@1.0.0), remove it so the module can be found using require
            var moduleNameAndVersion = modules[i];
            var moduleInfo = moduleNameAndVersion.split('@', 2);
            var moduleName = moduleInfo[0];
            var moduleVersion = moduleInfo[1];
            try {
                // Does the module need a specific version?
                if (moduleVersion) {
                    if (require(`${moduleName}/package.json`).version != moduleVersion) { throw new Error(); }
                } else {
                    // For all other modules, do the check here.
                    // Is the module in package.json? Install exact version.
                    if (typeof dependencies[moduleName] != undefined) { moduleVersion = dependencies[moduleName]; }
                    require(moduleName);
                }
            } catch (e) {
                if (previouslyInstalledModules[modules[i]] !== true) { missingModules.push(moduleNameAndVersion); }
            }
        }
        if (missingModules.length > 0) { InstallModule(missingModules.shift(), InstallModules, modules, func); } else { func(); }
    }
}

// Check if a module is present and install it if missing
function InstallModule(modulename, func, tag1, tag2) {
    console.log('Installing ' + modulename + '...');
    var child_process = require('child_process');
    var parentpath = __dirname;

    // Get the working directory
    if ((__dirname.endsWith('/node_modules/meshcentral')) || (__dirname.endsWith('\\node_modules\\meshcentral')) || (__dirname.endsWith('/node_modules/meshcentral/')) || (__dirname.endsWith('\\node_modules\\meshcentral\\'))) { parentpath = require('path').join(__dirname, '../..'); }

    child_process.exec(npmpath + ` install --no-optional ${modulename}`, { maxBuffer: 512000, timeout: 120000, cwd: parentpath }, function (error, stdout, stderr) {
        if ((error != null) && (error != '')) {
            console.log('ERROR: Unable to install required module "' + modulename + '". MeshCentral may not have access to npm, or npm may not have suffisent rights to load the new module. Try "npm install ' + modulename + '" to manualy install this module.\r\n');
            process.exit();
            return;
        }
        previouslyInstalledModules[modulename] = true;
        func(tag1, tag2);
        return;
    });
}

// Detect CTRL-C on Linux and stop nicely
process.on('SIGINT', function () { if (meshserver != null) { meshserver.Stop(); meshserver = null; } console.log('Server Ctrl-C exit...'); process.exit(); });

// Add a server warning, warnings will be shown to the administrator on the web application
var serverWarnings = [];
function addServerWarning(msg, print) { serverWarnings.push(msg); if (print !== false) { console.log("WARNING: " + msg); } }

// Load the really basic modules
var npmpath = 'npm';
var meshserver = null;
var childProcess = null;
var previouslyInstalledModules = {};
function mainStart() {
    // Check the NodeJS is version 6 or better.
    if (Number(process.version.match(/^v(\d+\.\d+)/)[1]) < 6) { console.log("MeshCentral requires Node v6 or above, current version is " + process.version + "."); return; }

    // If running within the node_modules folder, move working directory to the parent of the node_modules folder.
    if (__dirname.endsWith('\\node_modules\\meshcentral') || __dirname.endsWith('/node_modules/meshcentral')) { process.chdir(require('path').join(__dirname, '..', '..')); }

    // Check for any missing modules.
    InstallModules(['minimist'], function () {
        // Parse inbound arguments
        var args = require('minimist')(process.argv.slice(2));

        // Setup the NPM path
        if (args.npmpath == null) {
            try {
                var xnodepath = process.argv[0];
                var xnpmpath = require('path').join(require('path').dirname(process.argv[0]), 'npm');
                if (require('fs').existsSync(xnodepath) && require('fs').existsSync(xnpmpath)) {
                    if (xnodepath.indexOf(' ') >= 0) { xnodepath = '"' + xnodepath + '"'; }
                    if (xnpmpath.indexOf(' ') >= 0) { xnpmpath = '"' + xnpmpath + '"'; }
                    if (require('os').platform() == 'win32') { npmpath = xnpmpath; } else { npmpath = (xnodepath + ' ' + xnpmpath); }
                }
            } catch (ex) { console.log(ex); }
        } else {
            npmpath = args.npmpath;
        }

        // Get the server configuration
        var config = getConfig(false);
        if (config == null) { process.exit(); }

        // Lowercase the auth value if present
        for (var i in config.domains) { if (typeof config.domains[i].auth == 'string') { config.domains[i].auth = config.domains[i].auth.toLowerCase(); } }

        // Get the current node version
        var nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);

        // Check if Windows SSPI, LDAP, Passport and YubiKey OTP will be used
        var sspi = false;
        var ldap = false;
        var passport = null;
        var allsspi = true;
        var yubikey = false;
        var mstsc = false;
        var recordingIndex = false;
        var domainCount = 0;
        var wildleek = false;
        if (require('os').platform() == 'win32') { for (var i in config.domains) { domainCount++; if (config.domains[i].auth == 'sspi') { sspi = true; } else { allsspi = false; } } } else { allsspi = false; }
        if (domainCount == 0) { allsspi = false; }
        for (var i in config.domains) {
            if (i.startsWith('_')) continue;
            if (config.domains[i].yubikey != null) { yubikey = true; }
            if (config.domains[i].auth == 'ldap') { ldap = true; }
            if (config.domains[i].mstsc === true) { mstsc = true; }
            if ((typeof config.domains[i].authstrategies == 'object')) {
                if (passport == null) { passport = ['passport']; }
                if ((typeof config.domains[i].authstrategies.twitter == 'object') && (typeof config.domains[i].authstrategies.twitter.clientid == 'string') && (typeof config.domains[i].authstrategies.twitter.clientsecret == 'string') && (passport.indexOf('passport-twitter') == -1)) { passport.push('passport-twitter'); }
                if ((typeof config.domains[i].authstrategies.google == 'object') && (typeof config.domains[i].authstrategies.google.clientid == 'string') && (typeof config.domains[i].authstrategies.google.clientsecret == 'string') && (passport.indexOf('passport-google-oauth20') == -1)) { passport.push('passport-google-oauth20'); }
                if ((typeof config.domains[i].authstrategies.github == 'object') && (typeof config.domains[i].authstrategies.github.clientid == 'string') && (typeof config.domains[i].authstrategies.github.clientsecret == 'string') && (passport.indexOf('passport-github2') == -1)) { passport.push('passport-github2'); }
                if ((typeof config.domains[i].authstrategies.reddit == 'object') && (typeof config.domains[i].authstrategies.reddit.clientid == 'string') && (typeof config.domains[i].authstrategies.reddit.clientsecret == 'string') && (passport.indexOf('passport-reddit') == -1)) { passport.push('passport-reddit'); }
                if ((typeof config.domains[i].authstrategies.azure == 'object') && (typeof config.domains[i].authstrategies.azure.clientid == 'string') && (typeof config.domains[i].authstrategies.azure.clientsecret == 'string') && (typeof config.domains[i].authstrategies.azure.tenantid == 'string') && (passport.indexOf('passport-azure-oauth2') == -1)) { passport.push('passport-azure-oauth2'); passport.push('jwt-simple'); }
                if ((typeof config.domains[i].authstrategies.saml == 'object') || (typeof config.domains[i].authstrategies.jumpcloud == 'object')) { passport.push('passport-saml'); }
            }
            if ((config.domains[i].sessionrecording != null) && (config.domains[i].sessionrecording.index == true)) { recordingIndex = true; }
            if ((config.domains[i].passwordrequirements != null) && (config.domains[i].passwordrequirements.bancommonpasswords == true)) { if (nodeVersion < 8) { config.domains[i].passwordrequirements = false; addServerWarning('Common password checking requires NodeJS v8 or above.'); } else { wildleek = true; } }
        }

        // Build the list of required modules
        var modules = ['ws', 'cbor', 'nedb', 'https', 'yauzl', 'xmldom', 'ipcheck', 'express', 'archiver@4.0.2', 'multiparty', 'node-forge', 'express-ws', 'compression', 'body-parser', 'connect-redis', 'cookie-session', 'express-handlebars'];
        if (require('os').platform() == 'win32') { modules.push('node-windows@0.1.14'); if (sspi == true) { modules.push('node-sspi'); } } // Add Windows modules
        if (ldap == true) { modules.push('ldapauth-fork'); }
        if (mstsc == true) { modules.push('node-rdpjs-2'); }
        if (passport != null) { modules.push(...passport); }
        if (recordingIndex == true) { modules.push('image-size'); } // Need to get the remote desktop JPEG sizes to index the recodring file.
        if (config.letsencrypt != null) { if (nodeVersion < 8) { addServerWarning("Let's Encrypt support requires Node v8.x or higher.", !args.launch); } else { modules.push('acme-client'); } } // Add acme-client module
        if (config.settings.mqtt != null) { modules.push('aedes'); } // Add MQTT Modules
        if (config.settings.mysql != null) { modules.push('mysql'); } // Add MySQL, official driver.
        if (config.settings.mongodb != null) { modules.push('mongodb'); modules.push('saslprep'); } // Add MongoDB, official driver.
        if (config.settings.mariadb != null) { modules.push('mariadb'); } // Add MariaDB, official driver.
        if (config.settings.vault != null) { modules.push('node-vault'); } // Add official HashiCorp's Vault module.
        if (config.settings.plugins != null) {  modules.push('semver'); } // Required for version compat testing and update checks
        if ((config.settings.plugins != null) && (config.settings.plugins.proxy != null)) { modules.push('https-proxy-agent'); } // Required for HTTP/HTTPS proxy support
        else if (config.settings.xmongodb != null) { modules.push('mongojs'); } // Add MongoJS, old driver.
        if (config.smtp != null) { modules.push('nodemailer'); } // Add SMTP support
        if (args.translate) { modules.push('jsdom'); modules.push('esprima'); modules.push('minify-js'); modules.push('html-minifier'); } // Translation support

        // If running NodeJS < 8, install "util.promisify"
        if (nodeVersion < 8) { modules.push('util.promisify'); }

        // Setup encrypted zip support if needed
        if (config.settings.autobackup && config.settings.autobackup.zippassword) {
            modules.push('archiver-zip-encrypted');
            // Enable Google Drive Support
            if (typeof config.settings.autobackup.googledrive == 'object') {
                if (nodeVersion >= 8) {
                    modules.push('googleapis');
                } else {
                    addServerWarning("Google Drive requires Node v8.x or higher.", !args.launch);
                    delete config.settings.autobackup.googledrive;
                }
            }
            // Enable WebDAV Support
            if (typeof config.settings.autobackup.webdav == 'object') {
                if (nodeVersion >= 10) {
                    if ((typeof config.settings.autobackup.webdav.url != 'string') || (typeof config.settings.autobackup.webdav.username != 'string') || (typeof config.settings.autobackup.webdav.password != 'string')) { addServerWarning("Missing WebDAV parameters.", !args.launch); } else { modules.push('webdav'); }
                } else {
                    addServerWarning("WebDAV requires Node v10.x or higher.", !args.launch);
                    delete config.settings.autobackup.webdav;
                }
            }
        }

        // Setup common password blocking
        if (wildleek == true) { modules.push('wildleek@2.0.0'); }

        // Setup 2nd factor authentication
        if (config.settings.no2factorauth !== true) {
            // Setup YubiKey OTP if configured
            if (yubikey == true) { modules.push('yubikeyotp'); } // Add YubiKey OTP support
            if (allsspi == false) { modules.push('otplib@10.2.3'); } // Google Authenticator support (v10 supports older NodeJS versions).
        }

        // Desktop multiplexor support
        if (config.settings.desktopmultiplex === true) { modules.push('image-size'); }

        // SMS support
        if ((config.sms != null) && (config.sms.provider == 'twilio')) { modules.push('twilio'); }
        if ((config.sms != null) && (config.sms.provider == 'plivo')) {
            const NodeJSVer = Number(process.version.match(/^v(\d+\.\d+)/)[1]);
            if (NodeJSVer < 8) { console.log("SMS Plivo support requires Node v8 or above, current version is " + process.version + "."); } else { modules.push('plivo'); }
        }

        // Syslog support
        if ((require('os').platform() != 'win32') && (config.settings.syslog || config.settings.syslogjson)) { modules.push('modern-syslog'); }

        // Setup heapdump support if needed, useful for memory leak debugging
        // https://www.arbazsiddiqui.me/a-practical-guide-to-memory-leaks-in-nodejs/
        if (config.settings.heapdump === true) { modules.push('heapdump'); }

        // Install any missing modules and launch the server
        InstallModules(modules, function () {
            if (require('os').platform() == 'win32') { try { require('node-windows'); } catch (ex) { console.log("Module node-windows can't be loaded. Restart MeshCentral."); process.exit(); return; } }
            meshserver = CreateMeshCentralServer(config, args);
            meshserver.Start();
        });

        // On exit, also terminate the child process if applicable
        process.on('exit', function () { if (childProcess) { childProcess.kill(); childProcess = null; } });

        // If our parent exits, we also exit
        if (args.launch) {
            process.stderr.on('end', function () { process.exit(); });
            process.stdout.on('end', function () { process.exit(); });
            process.stdin.on('end', function () { process.exit(); });
            process.stdin.on('data', function (data) { });
        }
    });
}

if (require.main === module) {
    mainStart(); // Called directly, launch normally.
} else {
    module.exports.mainStart = mainStart; // Required as a module, useful for winservice.js
}
