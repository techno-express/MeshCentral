/** 
* @description MeshCentral database module
* @author Ylian Saint-Hilaire
* @copyright Intel Corporation 2018-2020
* @license Apache-2.0
* @version v0.0.2
*/

/*xjslint node: true */
/*xjslint plusplus: true */
/*xjslint maxlen: 256 */
/*jshint node: true */
/*jshint strict: false */
/*jshint esversion: 6 */
"use strict";

//
// Construct Meshcentral database object
//
// The default database is NeDB
// https://github.com/louischatriot/nedb
//
// Alternativety, MongoDB can be used
// https://www.mongodb.com/
// Just run with --mongodb [connectionstring], where the connection string is documented here: https://docs.mongodb.com/manual/reference/connection-string/
// The default collection is "meshcentral", but you can override it using --mongodbcol [collection]
//
module.exports.CreateDB = function (parent, func) {
    var obj = {};
    var Datastore = null;
    var expireEventsSeconds = (60 * 60 * 24 * 20);              // By default, expire events after 20 days (1728000). (Seconds * Minutes * Hours * Days)
    var expirePowerEventsSeconds = (60 * 60 * 24 * 10);         // By default, expire power events after 10 days (864000). (Seconds * Minutes * Hours * Days)
    var expireServerStatsSeconds = (60 * 60 * 24 * 30);         // By default, expire power events after 30 days (2592000). (Seconds * Minutes * Hours * Days)
    const common = require('./common.js');
    obj.identifier = null;
    obj.dbKey = null;
    obj.dbRecordsEncryptKey = null;
    obj.dbRecordsDecryptKey = null;
    obj.changeStream = false;
    obj.pluginsActive = ((parent.config) && (parent.config.settings) && (parent.config.settings.plugins != null) && (parent.config.settings.plugins != false) && ((typeof parent.config.settings.plugins != 'object') || (parent.config.settings.plugins.enabled != false)));

    obj.SetupDatabase = function (func) {
        // Check if the database unique identifier is present
        // This is used to check that in server peering mode, everyone is using the same database.
        obj.Get('DatabaseIdentifier', function (err, docs) {
            if (err != null) { parent.debug('db', 'ERROR (Get DatabaseIdentifier): ' + err); }
            if ((err == null) && (docs.length == 1) && (docs[0].value != null)) {
                obj.identifier = docs[0].value;
            } else {
                obj.identifier = Buffer.from(require('crypto').randomBytes(48), 'binary').toString('hex');
                obj.Set({ _id: 'DatabaseIdentifier', value: obj.identifier });
            }
        });

        // Load database schema version and check if we need to update
        obj.Get('SchemaVersion', function (err, docs) {
            if (err != null) { parent.debug('db', 'ERROR (Get SchemaVersion): ' + err); }
            var ver = 0;
            if ((err == null) && (docs.length == 1)) { ver = docs[0].value; }
            if (ver == 1) { console.log('This is an unsupported beta 1 database, delete it to create a new one.'); process.exit(0); }

            // TODO: Any schema upgrades here...
            obj.Set({ _id: 'SchemaVersion', value: 2 });

            func(ver);
        });
    };

    // Perform database maintenance
    obj.maintenance = function () {
        if (obj.databaseType == 1) { // NeDB will not remove expired records unless we try to access them. This will force the removal.
            obj.eventsfile.remove({ time: { '$lt': new Date(Date.now() - (expireEventsSeconds * 1000)) } }, { multi: true }); // Force delete older events
            obj.powerfile.remove({ time: { '$lt': new Date(Date.now() - (expirePowerEventsSeconds * 1000)) } }, { multi: true }); // Force delete older events
            obj.serverstatsfile.remove({ time: { '$lt': new Date(Date.now() - (expireServerStatsSeconds * 1000)) } }, { multi: true }); // Force delete older events
        }
    }

    obj.cleanup = function (func) {
        // TODO: Remove all mesh links to invalid users
        // TODO: Remove all meshes that dont have any links

        // Remove all events, power events and SMBIOS data from the main collection. They are all in seperate collections now.
        if ((obj.databaseType == 4) || (obj.databaseType == 5)) {
            // MariaDB or MySQL
            obj.RemoveAllOfType('event', function () { });
            obj.RemoveAllOfType('power', function () { });
            obj.RemoveAllOfType('smbios', function () { });
        } else if (obj.databaseType == 3) {
            // MongoDB
            obj.file.deleteMany({ type: 'event' }, { multi: true });
            obj.file.deleteMany({ type: 'power' }, { multi: true });
            obj.file.deleteMany({ type: 'smbios' }, { multi: true });
        } else {
            // NeDB or MongoJS
            obj.file.remove({ type: 'event' }, { multi: true });
            obj.file.remove({ type: 'power' }, { multi: true });
            obj.file.remove({ type: 'smbios' }, { multi: true });
        }

        // Remove all objects that have a "meshid" that no longer points to a valid mesh.
        obj.GetAllType('mesh', function (err, docs) {
            if (err != null) { parent.debug('db', 'ERROR (GetAll mesh): ' + err); }
            var meshlist = [];
            if ((err == null) && (docs.length > 0)) { for (var i in docs) { meshlist.push(docs[i]._id); } }
            if ((obj.databaseType == 4) || (obj.databaseType == 5)) {
                // MariaDB
                sqlDbQuery('DELETE FROM MeshCentral.Main WHERE (extra LIKE ("mesh/%") AND (extra NOT IN ?)', [meshlist], func);
            } else if (obj.databaseType == 3) {
                // MongoDB
                obj.file.deleteMany({ meshid: { $exists: true, $nin: meshlist } }, { multi: true });
            } else {
                // NeDB or MongoJS
                obj.file.remove({ meshid: { $exists: true, $nin: meshlist } }, { multi: true });
            }

            // Fix all of the creating & login to ticks by seconds, not milliseconds.
            obj.GetAllType('user', function (err, docs) {
                if (err != null) { parent.debug('db', 'ERROR (GetAll user): ' + err); }
                if ((err == null) && (docs.length > 0)) {
                    for (var i in docs) {
                        var fixed = false;

                        // Fix email address capitalization
                        if (docs[i].email && (docs[i].email != docs[i].email.toLowerCase())) {
                            docs[i].email = docs[i].email.toLowerCase(); fixed = true;
                        }

                        // Fix account creation
                        if (docs[i].creation) {
                            if (docs[i].creation > 1300000000000) { docs[i].creation = Math.floor(docs[i].creation / 1000); fixed = true; }
                            if ((docs[i].creation % 1) != 0) { docs[i].creation = Math.floor(docs[i].creation); fixed = true; }
                        }

                        // Fix last account login
                        if (docs[i].login) {
                            if (docs[i].login > 1300000000000) { docs[i].login = Math.floor(docs[i].login / 1000); fixed = true; }
                            if ((docs[i].login % 1) != 0) { docs[i].login = Math.floor(docs[i].login); fixed = true; }
                        }

                        // Fix last password change
                        if (docs[i].passchange) {
                            if (docs[i].passchange > 1300000000000) { docs[i].passchange = Math.floor(docs[i].passchange / 1000); fixed = true; }
                            if ((docs[i].passchange % 1) != 0) { docs[i].passchange = Math.floor(docs[i].passchange); fixed = true; }
                        }

                        // Fix subscriptions
                        if (docs[i].subscriptions != null) { delete docs[i].subscriptions; fixed = true; }

                        // Save the user if needed
                        if (fixed) { obj.Set(docs[i]); }

                        // We are done
                        if (func) { func(); }
                    }
                }
            });
        });
    };

    // Get encryption key
    obj.getEncryptDataKey = function (password) {
        if (typeof password != 'string') return null;
        return parent.crypto.createHash('sha384').update(password).digest("raw").slice(0, 32);
    }

    // Encrypt data 
    obj.encryptData = function (password, plaintext) {
        var key = obj.getEncryptDataKey(password);
        if (key == null) return null;
        const iv = parent.crypto.randomBytes(16);
        const aes = parent.crypto.createCipheriv('aes-256-cbc', key, iv);
        var ciphertext = aes.update(plaintext);
        ciphertext = Buffer.concat([iv, ciphertext, aes.final()]);
        return ciphertext.toString('base64');
    }

    // Decrypt data 
    obj.decryptData = function (password, ciphertext) {
        try {
            var key = obj.getEncryptDataKey(password);
            if (key == null) return null;
            const ciphertextBytes = Buffer.from(ciphertext, 'base64');
            const iv = ciphertextBytes.slice(0, 16);
            const data = ciphertextBytes.slice(16);
            const aes = parent.crypto.createDecipheriv('aes-256-cbc', key, iv);
            var plaintextBytes = Buffer.from(aes.update(data));
            plaintextBytes = Buffer.concat([plaintextBytes, aes.final()]);
            return plaintextBytes;
        } catch (ex) { return null; }
    }

    // Get the number of records in the database for various types, this is the slow NeDB way.
    // WARNING: This is a terrible query for database performance. Only do this when needed. This query will look at almost every document in the database.
    obj.getStats = function (func) {
        if (obj.databaseType == 3) {
            // MongoDB
            obj.file.aggregate([{ "$group": { _id: "$type", count: { $sum: 1 } } }]).toArray(function (err, docs) {
                var counters = {}, totalCount = 0;
                if (err == null) { for (var i in docs) { if (docs[i]._id != null) { counters[docs[i]._id] = docs[i].count; totalCount += docs[i].count; } } }
                func(counters);
            });
        } else if (obj.databaseType == 2) {
            // MongoJS
            obj.file.aggregate([{ "$group": { _id: "$type", count: { $sum: 1 } } }], function (err, docs) {
                var counters = {}, totalCount = 0;
                if (err == null) { for (var i in docs) { if (docs[i]._id != null) { counters[docs[i]._id] = docs[i].count; totalCount += docs[i].count; } } }
                func(counters);
            });
        } else if (obj.databaseType == 1) {
            // NeDB version
            obj.file.count({ type: 'node' }, function (err, nodeCount) {
                obj.file.count({ type: 'mesh' }, function (err, meshCount) {
                    obj.file.count({ type: 'user' }, function (err, userCount) {
                        obj.file.count({ type: 'sysinfo' }, function (err, sysinfoCount) {
                            obj.file.count({ type: 'note' }, function (err, noteCount) {
                                obj.file.count({ type: 'iploc' }, function (err, iplocCount) {
                                    obj.file.count({ type: 'ifinfo' }, function (err, ifinfoCount) {
                                        obj.file.count({ type: 'cfile' }, function (err, cfileCount) {
                                            obj.file.count({ type: 'lastconnect' }, function (err, lastconnectCount) {
                                                obj.file.count({}, function (err, totalCount) {
                                                    func({ node: nodeCount, mesh: meshCount, user: userCount, sysinfo: sysinfoCount, iploc: iplocCount, note: noteCount, ifinfo: ifinfoCount, cfile: cfileCount, lastconnect: lastconnectCount, total: totalCount });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        }
    }

    // This is used to rate limit a number of operation per day. Returns a startValue each new days, but you can substract it and save the value in the db.
    obj.getValueOfTheDay = function (id, startValue, func) { obj.Get(id, function (err, docs) { var date = new Date(), t = date.toLocaleDateString(); if ((err == null) && (docs.length == 1)) { var r = docs[0]; if (r.day == t) { func({ _id: id, value: r.value, day: t }); return; } } func({ _id: id, value: startValue, day: t }); }); };
    obj.escapeBase64 = function escapeBase64(val) { return (val.replace(/\+/g, '@').replace(/\//g, '$')); }

    // Encrypt an database object
    obj.performRecordEncryptionRecode = function (func) {
        var count = 0;
        obj.GetAllType('user', function (err, docs) {
            if (err != null) { parent.debug('db', 'ERROR (performRecordEncryptionRecode): ' + err); }
            if (err == null) { for (var i in docs) { count++; obj.Set(docs[i]); } }
            obj.GetAllType('node', function (err, docs) {
                if (err == null) { for (var i in docs) { count++; obj.Set(docs[i]); } }
                obj.GetAllType('mesh', function (err, docs) {
                    if (err == null) { for (var i in docs) { count++; obj.Set(docs[i]); } }
                    if (obj.databaseType == 1) { // If we are using NeDB, compact the database.
                        obj.file.persistence.compactDatafile();
                        obj.file.on('compaction.done', function () { func(count); }); // It's important to wait for compaction to finish before exit, otherwise NeDB may corrupt.
                    } else {
                        func(count); // For all other databases, normal exit.
                    }
                });
            });
        });
    }

    // Encrypt an database object
    function performTypedRecordDecrypt(data) {
        if ((data == null) || (obj.dbRecordsDecryptKey == null) || (typeof data != 'object')) return data;
        for (var i in data) {
            if (data[i] == null) continue;
            if (data[i].type == 'user') {
                data[i] = performPartialRecordDecrypt(data[i]);
            } else if ((data[i].type == 'node') && (data[i].intelamt != null)) {
                data[i].intelamt = performPartialRecordDecrypt(data[i].intelamt);
            } else if ((data[i].type == 'mesh') && (data[i].amt != null)) {
                data[i].amt = performPartialRecordDecrypt(data[i].amt);
            }
        }
        return data;
    }

    // Encrypt an database object
    function performTypedRecordEncrypt(data) {
        if (obj.dbRecordsEncryptKey == null) return data;
        if (data.type == 'user') { return performPartialRecordEncrypt(Clone(data), ['otpkeys', 'otphkeys', 'otpsecret', 'salt', 'hash', 'oldpasswords']); }
        else if ((data.type == 'node') && (data.intelamt != null)) { var xdata = Clone(data); xdata.intelamt = performPartialRecordEncrypt(xdata.intelamt, ['user', 'pass', 'mpspass']); return xdata; }
        else if ((data.type == 'mesh') && (data.amt != null)) { var xdata = Clone(data); xdata.amt = performPartialRecordEncrypt(xdata.amt, ['password']); return xdata; }
        return data;
    }

    // Encrypt an object and return a buffer.
    function performPartialRecordEncrypt(plainobj, encryptNames) {
        if (typeof plainobj != 'object') return plainobj;
        var enc = {}, enclen = 0;
        for (var i in encryptNames) { if (plainobj[encryptNames[i]] != null) { enclen++; enc[encryptNames[i]] = plainobj[encryptNames[i]]; delete plainobj[encryptNames[i]]; } }
        if (enclen > 0) { plainobj._CRYPT = performRecordEncrypt(enc); } else { delete plainobj._CRYPT; }
        return plainobj;
    }

    // Encrypt an object and return a buffer.
    function performPartialRecordDecrypt(plainobj) {
        if ((typeof plainobj != 'object') || (plainobj._CRYPT == null)) return plainobj;
        var enc = performRecordDecrypt(plainobj._CRYPT);
        if (enc != null) { for (var i in enc) { plainobj[i] = enc[i]; } }
        delete plainobj._CRYPT;
        return plainobj;
    }

    // Encrypt an object and return a base64.
    function performRecordEncrypt(plainobj) {
        if (obj.dbRecordsEncryptKey == null) return null;
        const iv = parent.crypto.randomBytes(12);
        const aes = parent.crypto.createCipheriv('aes-256-gcm', obj.dbRecordsEncryptKey, iv);
        var ciphertext = aes.update(JSON.stringify(plainobj));
        var cipherfinal = aes.final();
        ciphertext = Buffer.concat([iv, aes.getAuthTag(), ciphertext, cipherfinal]);
        return ciphertext.toString('base64');
    }

    // Takes a base64 and return an object.
    function performRecordDecrypt(ciphertext) {
        if (obj.dbRecordsDecryptKey == null) return null;
        const ciphertextBytes = Buffer.from(ciphertext, 'base64');
        const iv = ciphertextBytes.slice(0, 12);
        const data = ciphertextBytes.slice(28);
        const aes = parent.crypto.createDecipheriv('aes-256-gcm', obj.dbRecordsDecryptKey, iv);
        aes.setAuthTag(ciphertextBytes.slice(12, 28));
        var plaintextBytes, r;
        try {
            plaintextBytes = Buffer.from(aes.update(data));
            plaintextBytes = Buffer.concat([plaintextBytes, aes.final()]);
            r = JSON.parse(plaintextBytes.toString());
        } catch (e) { throw "Incorrect DbRecordsDecryptKey/DbRecordsEncryptKey or invalid database _CRYPT data: " + e; }
        return r;
    }

    // Clone an object (TODO: Make this more efficient)
    function Clone(v) { return JSON.parse(JSON.stringify(v)); }

    // Read expiration time from configuration file
    if (typeof parent.args.dbexpire == 'object') {
        if (typeof parent.args.dbexpire.events == 'number') { expireEventsSeconds = parent.args.dbexpire.events; }
        if (typeof parent.args.dbexpire.powerevents == 'number') { expirePowerEventsSeconds = parent.args.dbexpire.powerevents; }
        if (typeof parent.args.dbexpire.statsevents == 'number') { expireServerStatsSeconds = parent.args.dbexpire.statsevents; }
    }

    // If a DB record encryption key is provided, perform database record encryption
    if ((typeof parent.args.dbrecordsencryptkey == 'string') && (parent.args.dbrecordsencryptkey.length != 0)) {
        // Hash the database password into a AES256 key and setup encryption and decryption.
        obj.dbRecordsEncryptKey = obj.dbRecordsDecryptKey = parent.crypto.createHash('sha384').update(parent.args.dbrecordsencryptkey).digest('raw').slice(0, 32);
    }

    // If a DB record decryption key is provided, perform database record decryption
    if ((typeof parent.args.dbrecordsdecryptkey == 'string') && (parent.args.dbrecordsdecryptkey.length != 0)) {
        // Hash the database password into a AES256 key and setup encryption and decryption.
        obj.dbRecordsDecryptKey = parent.crypto.createHash('sha384').update(parent.args.dbrecordsdecryptkey).digest('raw').slice(0, 32);
    }

    if (parent.args.mariadb || parent.args.mysql) {
        if (parent.args.mariadb) {
            // Use MariaDB
            obj.databaseType = 4;
            Datastore = require('mariadb').createPool(parent.args.mariadb);
        } else if (parent.args.mysql) {
            // Use MySQL
            Datastore = require('mysql').createConnection(parent.args.mysql);
            obj.databaseType = 5;
        }
        //sqlDbQuery('DROP DATABASE MeshCentral', null, function (err, docs) { console.log('DROP'); }); return;
        sqlDbQuery('USE meshcentral', null, function (err, docs) {
            if (err != null) { parent.debug('db', 'ERROR: USE meshcentral: ' + err); }
            if (err == null) { setupFunctions(func); } else {
                parent.debug('db', 'Creating database...');
                sqlDbBatchExec([
                    'CREATE DATABASE meshcentral',
                    // Main table
                    'CREATE TABLE meshcentral.main (id VARCHAR(256) NOT NULL, type CHAR(32), domain CHAR(64), extra CHAR(255), extraex CHAR(255), doc JSON, PRIMARY KEY(id), CHECK (json_valid(doc)))',
                    'CREATE INDEX ndxtypedomainextra ON meshcentral.main (type, domain, extra)',
                    'CREATE INDEX ndxextra ON meshcentral.main (extra)',
                    'CREATE INDEX ndxextraex ON meshcentral.main (extraex)',
                    // Events table
                    'CREATE TABLE meshcentral.events(id INT NOT NULL AUTO_INCREMENT, time DATETIME, domain CHAR(64), action CHAR(255), nodeid CHAR(255), userid CHAR(255), doc JSON, PRIMARY KEY(id), CHECK(json_valid(doc)))',
                    'CREATE INDEX ndxeventstime ON meshcentral.events(time)',
                    'CREATE INDEX ndxeventsusername ON meshcentral.events(domain, userid, time)',
                    'CREATE INDEX ndxeventsdomainnodeidtime ON meshcentral.events(domain, nodeid, time)',
                    // Events ID table
                    'CREATE TABLE meshcentral.eventids(fkid INT NOT NULL, target CHAR(255), CONSTRAINT fk_eventid FOREIGN KEY (fkid) REFERENCES events (id) ON DELETE CASCADE ON UPDATE RESTRICT)',
                    'CREATE INDEX ndxeventids ON meshcentral.eventids(target)',
                    // Server stats table
                    'CREATE TABLE meshcentral.serverstats (time DATETIME, expire DATETIME, doc JSON, PRIMARY KEY(time), CHECK (json_valid(doc)))',
                    'CREATE INDEX ndxserverstattime ON meshcentral.serverstats (time)',
                    'CREATE INDEX ndxserverstatexpire ON meshcentral.serverstats (expire)',
                    // Power events table
                    'CREATE TABLE meshcentral.power (id INT NOT NULL AUTO_INCREMENT, time DATETIME, nodeid CHAR(255), doc JSON, PRIMARY KEY(id), CHECK (json_valid(doc)))',
                    'CREATE INDEX ndxpowernodeidtime ON meshcentral.power (nodeid, time)',
                    // SMBIOS table
                    'CREATE TABLE meshcentral.smbios (id CHAR(255), time DATETIME, expire DATETIME, doc JSON, PRIMARY KEY(id), CHECK (json_valid(doc)))',
                    'CREATE INDEX ndxsmbiostime ON meshcentral.smbios (time)',
                    'CREATE INDEX ndxsmbiosexpire ON meshcentral.smbios (expire)',
                    // Plugins table
                    'CREATE TABLE meshcentral.plugin (id INT NOT NULL AUTO_INCREMENT, doc JSON, PRIMARY KEY(id), CHECK (json_valid(doc)))'
                ], function (err) {
                    if (err != null) { parent.debug('db', 'BatchSetupDb: ' + err); }
                    setupFunctions(func);
                });
            }
        });
    } else if (parent.args.mongodb) {
        // Use MongoDB
        obj.databaseType = 3;
        require('mongodb').MongoClient.connect(parent.args.mongodb, { useNewUrlParser: true, useUnifiedTopology: true }, function (err, client) {
            if (err != null) { console.log("Unable to connect to database: " + err); process.exit(); return; }
            Datastore = client;
            parent.debug('db', 'Connected to MongoDB database...');

            // Get the database name and setup the database client
            var dbname = 'meshcentral';
            if (parent.args.mongodbname) { dbname = parent.args.mongodbname; }
            const dbcollectionname = (parent.args.mongodbcol) ? (parent.args.mongodbcol) : 'meshcentral';
            const db = client.db(dbname);

            // Check the database version
            db.admin().serverInfo(function (err, info) {
                if ((err != null) || (info == null) || (info.versionArray == null) || (Array.isArray(info.versionArray) == false) || (info.versionArray.length < 2) || (typeof info.versionArray[0] != 'number') || (typeof info.versionArray[1] != 'number')) {
                    console.log('WARNING: Unable to check MongoDB version.');
                } else {
                    if ((info.versionArray[0] < 3) || ((info.versionArray[0] == 3) && (info.versionArray[1] < 6))) {
                        // We are running with mongoDB older than 3.6, this is not good.
                        parent.addServerWarning("Current version of MongoDB (" + info.version + ") is too old, please upgrade to MongoDB 3.6 or better.");
                    }
                }
            });

            // Setup MongoDB main collection and indexes
            obj.file = db.collection(dbcollectionname);
            obj.file.indexes(function (err, indexes) {
                // Check if we need to reset indexes
                var indexesByName = {}, indexCount = 0;
                for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
                if ((indexCount != 4) || (indexesByName['TypeDomainMesh1'] == null) || (indexesByName['Email1'] == null) || (indexesByName['Mesh1'] == null)) {
                    console.log('Resetting main indexes...');
                    obj.file.dropIndexes(function (err) {
                        obj.file.createIndex({ type: 1, domain: 1, meshid: 1 }, { sparse: 1, name: 'TypeDomainMesh1' });       // Speeds up GetAllTypeNoTypeField() and GetAllTypeNoTypeFieldMeshFiltered()
                        obj.file.createIndex({ email: 1 }, { sparse: 1, name: 'Email1' });                                     // Speeds up GetUserWithEmail() and GetUserWithVerifiedEmail()
                        obj.file.createIndex({ meshid: 1 }, { sparse: 1, name: 'Mesh1' });                                     // Speeds up RemoveMesh()
                    });
                }
            });

            // Setup the changeStream on the MongoDB main collection if possible
            if (parent.args.mongodbchangestream == true) {
                if (typeof obj.file.watch != 'function') {
                    console.log('WARNING: watch() is not a function, MongoDB ChangeStream not supported.');
                } else {
                    obj.fileChangeStream = obj.file.watch([{ $match: { $or: [{ 'fullDocument.type': { $in: ['node', 'mesh', 'user', 'ugrp'] } }, { 'operationType': 'delete' }] } }], { fullDocument: 'updateLookup' });
                    obj.fileChangeStream.on('change', function (change) {
                        if (change.operationType == 'update') {
                            switch (change.fullDocument.type) {
                                case 'node': { dbNodeChange(change, false); break; } // A node has changed
                                case 'mesh': { dbMeshChange(change, false); break; } // A device group has changed
                                case 'user': { dbUserChange(change, false); break; } // A user account has changed
                                case 'ugrp': { dbUGrpChange(change, false); break; } // A user account has changed
                            }
                        } else if (change.operationType == 'insert') {
                            switch (change.fullDocument.type) {
                                case 'node': { dbNodeChange(change, true); break; } // A node has added
                                case 'mesh': { dbMeshChange(change, true); break; } // A device group has created
                                case 'user': { dbUserChange(change, true); break; } // A user account has created
                                case 'ugrp': { dbUGrpChange(change, true); break; } // A user account has created
                            }
                        } else if (change.operationType == 'delete') {
                            var splitId = change.documentKey._id.split('/');
                            switch (splitId[0]) {
                                case 'node': {
                                    //Not Good: Problem here is that we don't know what meshid the node belonged to before the delete.
                                    //parent.DispatchEvent(['*', node.meshid], obj, { etype: 'node', action: 'removenode', nodeid: change.documentKey._id, domain: splitId[1] });
                                    break;
                                }
                                case 'mesh': {
                                    parent.DispatchEvent(['*', change.documentKey._id], obj, { etype: 'mesh', action: 'deletemesh', meshid: change.documentKey._id, domain: splitId[1] });
                                    break;
                                }
                                case 'user': {
                                    //Not Good: This is not a perfect user removal because we don't know what groups the user was in.
                                    //parent.DispatchEvent(['*', 'server-users'], obj, { etype: 'user', action: 'accountremove', userid: change.documentKey._id, domain: splitId[1], username: splitId[2] });
                                    break;
                                }
                                case 'ugrp': {
                                    parent.DispatchEvent(['*', change.documentKey._id], obj, { etype: 'ugrp', action: 'deleteusergroup', ugrpid: change.documentKey._id, domain: splitId[1] });
                                    break;
                                }
                            }
                        }
                    });
                    obj.changeStream = true;
                }
            }

            // Setup MongoDB events collection and indexes
            obj.eventsfile = db.collection('events'); // Collection containing all events
            obj.eventsfile.indexes(function (err, indexes) {
                // Check if we need to reset indexes
                var indexesByName = {}, indexCount = 0;
                for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
                if ((indexCount != 5) || (indexesByName['Username1'] == null) || (indexesByName['DomainNodeTime1'] == null) || (indexesByName['IdsAndTime1'] == null) || (indexesByName['ExpireTime1'] == null)) {
                    // Reset all indexes
                    console.log("Resetting events indexes...");
                    obj.eventsfile.dropIndexes(function (err) {
                        obj.eventsfile.createIndex({ username: 1 }, { sparse: 1, name: 'Username1' });
                        obj.eventsfile.createIndex({ domain: 1, nodeid: 1, time: -1 }, { sparse: 1, name: 'DomainNodeTime1' });
                        obj.eventsfile.createIndex({ ids: 1, time: -1 }, { sparse: 1, name: 'IdsAndTime1' });
                        obj.eventsfile.createIndex({ time: 1 }, { expireAfterSeconds: expireEventsSeconds, name: 'ExpireTime1' });
                    });
                } else if (indexesByName['ExpireTime1'].expireAfterSeconds != expireEventsSeconds) {
                    // Reset the timeout index
                    console.log("Resetting events expire index...");
                    obj.eventsfile.dropIndex('ExpireTime1', function (err) {
                        obj.eventsfile.createIndex({ time: 1 }, { expireAfterSeconds: expireEventsSeconds, name: 'ExpireTime1' });
                    });
                }
            });

            // Setup MongoDB power events collection and indexes
            obj.powerfile = db.collection('power');                                 // Collection containing all power events
            obj.powerfile.indexes(function (err, indexes) {
                // Check if we need to reset indexes
                var indexesByName = {}, indexCount = 0;
                for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
                if ((indexCount != 3) || (indexesByName['NodeIdAndTime1'] == null) || (indexesByName['ExpireTime1'] == null)) {
                    // Reset all indexes
                    console.log("Resetting power events indexes...");
                    obj.powerfile.dropIndexes(function (err) {
                        // Create all indexes
                        obj.powerfile.createIndex({ nodeid: 1, time: 1 }, { sparse: 1, name: 'NodeIdAndTime1' });
                        obj.powerfile.createIndex({ 'time': 1 }, { expireAfterSeconds: expirePowerEventsSeconds, name: 'ExpireTime1' });
                    });
                } else if (indexesByName['ExpireTime1'].expireAfterSeconds != expirePowerEventsSeconds) {
                    // Reset the timeout index
                    console.log("Resetting power events expire index...");
                    obj.powerfile.dropIndex('ExpireTime1', function (err) {
                        // Reset the expire power events index
                        obj.powerfile.createIndex({ 'time': 1 }, { expireAfterSeconds: expirePowerEventsSeconds, name: 'ExpireTime1' });
                    });
                }
            });

            // Setup MongoDB smbios collection, no indexes needed
            obj.smbiosfile = db.collection('smbios');                               // Collection containing all smbios information

            // Setup MongoDB server stats collection
            obj.serverstatsfile = db.collection('serverstats');                     // Collection of server stats
            obj.serverstatsfile.indexes(function (err, indexes) {
                // Check if we need to reset indexes
                var indexesByName = {}, indexCount = 0;
                for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
                if ((indexCount != 3) || (indexesByName['ExpireTime1'] == null)) {
                    // Reset all indexes
                    console.log("Resetting server stats indexes...");
                    obj.serverstatsfile.dropIndexes(function (err) {
                        // Create all indexes
                        obj.serverstatsfile.createIndex({ 'time': 1 }, { expireAfterSeconds: expireServerStatsSeconds, name: 'ExpireTime1' });
                        obj.serverstatsfile.createIndex({ 'expire': 1 }, { expireAfterSeconds: 0, name: 'ExpireTime2' });  // Auto-expire events
                    });
                } else if (indexesByName['ExpireTime1'].expireAfterSeconds != expireServerStatsSeconds) {
                    // Reset the timeout index
                    console.log("Resetting server stats expire index...");
                    obj.serverstatsfile.dropIndex('ExpireTime1', function (err) {
                        // Reset the expire server stats index
                        obj.serverstatsfile.createIndex({ 'time': 1 }, { expireAfterSeconds: expireServerStatsSeconds, name: 'ExpireTime1' });
                    });
                }
            });

            // Setup plugin info collection
            if (obj.pluginsActive) { obj.pluginsfile = db.collection('plugins'); }

            setupFunctions(func); // Completed setup of MongoDB
        });
    } else if (parent.args.xmongodb) {
        // Use MongoJS, this is the old system.
        obj.databaseType = 2;
        Datastore = require('mongojs');
        var db = Datastore(parent.args.xmongodb);
        var dbcollection = 'meshcentral';
        if (parent.args.mongodbcol) { dbcollection = parent.args.mongodbcol; }

        // Setup MongoDB main collection and indexes
        obj.file = db.collection(dbcollection);
        obj.file.getIndexes(function (err, indexes) {
            // Check if we need to reset indexes
            var indexesByName = {}, indexCount = 0;
            for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
            if ((indexCount != 4) || (indexesByName['TypeDomainMesh1'] == null) || (indexesByName['Email1'] == null) || (indexesByName['Mesh1'] == null)) {
                console.log("Resetting main indexes...");
                obj.file.dropIndexes(function (err) {
                    obj.file.createIndex({ type: 1, domain: 1, meshid: 1 }, { sparse: 1, name: 'TypeDomainMesh1' });       // Speeds up GetAllTypeNoTypeField() and GetAllTypeNoTypeFieldMeshFiltered()
                    obj.file.createIndex({ email: 1 }, { sparse: 1, name: 'Email1' });                                     // Speeds up GetUserWithEmail() and GetUserWithVerifiedEmail()
                    obj.file.createIndex({ meshid: 1 }, { sparse: 1, name: 'Mesh1' });                                     // Speeds up RemoveMesh()
                });
            }
        });

        // Setup MongoDB events collection and indexes
        obj.eventsfile = db.collection('events');                               // Collection containing all events
        obj.eventsfile.getIndexes(function (err, indexes) {
            // Check if we need to reset indexes
            var indexesByName = {}, indexCount = 0;
            for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
            if ((indexCount != 5) || (indexesByName['Username1'] == null) || (indexesByName['DomainNodeTime1'] == null) || (indexesByName['IdsAndTime1'] == null) || (indexesByName['ExpireTime1'] == null)) {
                // Reset all indexes
                console.log("Resetting events indexes...");
                obj.eventsfile.dropIndexes(function (err) {
                    obj.eventsfile.createIndex({ username: 1 }, { sparse: 1, name: 'Username1' });
                    obj.eventsfile.createIndex({ domain: 1, nodeid: 1, time: -1 }, { sparse: 1, name: 'DomainNodeTime1' });
                    obj.eventsfile.createIndex({ ids: 1, time: -1 }, { sparse: 1, name: 'IdsAndTime1' });
                    obj.eventsfile.createIndex({ time: 1 }, { expireAfterSeconds: expireEventsSeconds, name: 'ExpireTime1' });
                });
            } else if (indexesByName['ExpireTime1'].expireAfterSeconds != expireEventsSeconds) {
                // Reset the timeout index
                console.log("Resetting events expire index...");
                obj.eventsfile.dropIndex('ExpireTime1', function (err) {
                    obj.eventsfile.createIndex({ time: 1 }, { expireAfterSeconds: expireEventsSeconds, name: 'ExpireTime1' });
                });
            }
        });

        // Setup MongoDB power events collection and indexes
        obj.powerfile = db.collection('power');                                 // Collection containing all power events
        obj.powerfile.getIndexes(function (err, indexes) {
            // Check if we need to reset indexes
            var indexesByName = {}, indexCount = 0;
            for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
            if ((indexCount != 3) || (indexesByName['NodeIdAndTime1'] == null) || (indexesByName['ExpireTime1'] == null)) {
                // Reset all indexes
                console.log("Resetting power events indexes...");
                obj.powerfile.dropIndexes(function (err) {
                    // Create all indexes
                    obj.powerfile.createIndex({ nodeid: 1, time: 1 }, { sparse: 1, name: 'NodeIdAndTime1' });
                    obj.powerfile.createIndex({ 'time': 1 }, { expireAfterSeconds: expirePowerEventsSeconds, name: 'ExpireTime1' });
                });
            } else if (indexesByName['ExpireTime1'].expireAfterSeconds != expirePowerEventsSeconds) {
                // Reset the timeout index
                console.log("Resetting power events expire index...");
                obj.powerfile.dropIndex('ExpireTime1', function (err) {
                    // Reset the expire power events index
                    obj.powerfile.createIndex({ 'time': 1 }, { expireAfterSeconds: expirePowerEventsSeconds, name: 'ExpireTime1' });
                });
            }
        });

        // Setup MongoDB smbios collection, no indexes needed
        obj.smbiosfile = db.collection('smbios');                               // Collection containing all smbios information

        // Setup MongoDB server stats collection
        obj.serverstatsfile = db.collection('serverstats');                     // Collection of server stats
        obj.serverstatsfile.getIndexes(function (err, indexes) {
            // Check if we need to reset indexes
            var indexesByName = {}, indexCount = 0;
            for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
            if ((indexCount != 3) || (indexesByName['ExpireTime1'] == null)) {
                // Reset all indexes
                console.log("Resetting server stats indexes...");
                obj.serverstatsfile.dropIndexes(function (err) {
                    // Create all indexes
                    obj.serverstatsfile.createIndex({ 'time': 1 }, { expireAfterSeconds: expireServerStatsSeconds, name: 'ExpireTime1' });
                    obj.serverstatsfile.createIndex({ 'expire': 1 }, { expireAfterSeconds: 0, name: 'ExpireTime2' });  // Auto-expire events
                });
            } else if (indexesByName['ExpireTime1'].expireAfterSeconds != expireServerStatsSeconds) {
                // Reset the timeout index
                console.log("Resetting server stats expire index...");
                obj.serverstatsfile.dropIndex('ExpireTime1', function (err) {
                    // Reset the expire server stats index
                    obj.serverstatsfile.createIndex({ 'time': 1 }, { expireAfterSeconds: expireServerStatsSeconds, name: 'ExpireTime1' });
                });
            }
        });

        // Setup plugin info collection
        if (obj.pluginsActive) { obj.pluginsfile = db.collection('plugins'); }

        setupFunctions(func); // Completed setup of MongoJS
    } else {
        // Use NeDB (The default)
        obj.databaseType = 1;
        Datastore = require('nedb');
        var datastoreOptions = { filename: parent.getConfigFilePath('meshcentral.db'), autoload: true };

        // If a DB encryption key is provided, perform database encryption
        if ((typeof parent.args.dbencryptkey == 'string') && (parent.args.dbencryptkey.length != 0)) {
            // Hash the database password into a AES256 key and setup encryption and decryption.
            obj.dbKey = parent.crypto.createHash('sha384').update(parent.args.dbencryptkey).digest('raw').slice(0, 32);
            datastoreOptions.afterSerialization = function (plaintext) {
                const iv = parent.crypto.randomBytes(16);
                const aes = parent.crypto.createCipheriv('aes-256-cbc', obj.dbKey, iv);
                var ciphertext = aes.update(plaintext);
                ciphertext = Buffer.concat([iv, ciphertext, aes.final()]);
                return ciphertext.toString('base64');
            }
            datastoreOptions.beforeDeserialization = function (ciphertext) {
                const ciphertextBytes = Buffer.from(ciphertext, 'base64');
                const iv = ciphertextBytes.slice(0, 16);
                const data = ciphertextBytes.slice(16);
                const aes = parent.crypto.createDecipheriv('aes-256-cbc', obj.dbKey, iv);
                var plaintextBytes = Buffer.from(aes.update(data));
                plaintextBytes = Buffer.concat([plaintextBytes, aes.final()]);
                return plaintextBytes.toString();
            }
        }

        // Start NeDB main collection and setup indexes
        obj.file = new Datastore(datastoreOptions);
        obj.file.persistence.setAutocompactionInterval(86400000); // Compact once a day
        obj.file.ensureIndex({ fieldName: 'type' });
        obj.file.ensureIndex({ fieldName: 'domain' });
        obj.file.ensureIndex({ fieldName: 'meshid', sparse: true });
        obj.file.ensureIndex({ fieldName: 'nodeid', sparse: true });
        obj.file.ensureIndex({ fieldName: 'email', sparse: true });

        // Setup the events collection and setup indexes
        obj.eventsfile = new Datastore({ filename: parent.getConfigFilePath('meshcentral-events.db'), autoload: true, corruptAlertThreshold: 1 });
        obj.eventsfile.persistence.setAutocompactionInterval(86400000); // Compact once a day
        obj.eventsfile.ensureIndex({ fieldName: 'ids' }); // TODO: Not sure if this is a good index, this is a array field.
        obj.eventsfile.ensureIndex({ fieldName: 'nodeid', sparse: true });
        obj.eventsfile.ensureIndex({ fieldName: 'time', expireAfterSeconds: expireEventsSeconds });
        obj.eventsfile.remove({ time: { '$lt': new Date(Date.now() - (expireEventsSeconds * 1000)) } }, { multi: true }); // Force delete older events

        // Setup the power collection and setup indexes
        obj.powerfile = new Datastore({ filename: parent.getConfigFilePath('meshcentral-power.db'), autoload: true, corruptAlertThreshold: 1 });
        obj.powerfile.persistence.setAutocompactionInterval(86400000); // Compact once a day
        obj.powerfile.ensureIndex({ fieldName: 'nodeid' });
        obj.powerfile.ensureIndex({ fieldName: 'time', expireAfterSeconds: expirePowerEventsSeconds });
        obj.powerfile.remove({ time: { '$lt': new Date(Date.now() - (expirePowerEventsSeconds * 1000)) } }, { multi: true }); // Force delete older events

        // Setup the SMBIOS collection, for NeDB we don't setup SMBIOS since NeDB will corrupt the database. Remove any existing ones.
        //obj.smbiosfile = new Datastore({ filename: parent.getConfigFilePath('meshcentral-smbios.db'), autoload: true, corruptAlertThreshold: 1 });
        parent.fs.unlink(parent.getConfigFilePath('meshcentral-smbios.db'), function () { });

        // Setup the server stats collection and setup indexes
        obj.serverstatsfile = new Datastore({ filename: parent.getConfigFilePath('meshcentral-stats.db'), autoload: true, corruptAlertThreshold: 1 });
        obj.serverstatsfile.persistence.setAutocompactionInterval(86400000); // Compact once a day
        obj.serverstatsfile.ensureIndex({ fieldName: 'time', expireAfterSeconds: expireServerStatsSeconds });
        obj.serverstatsfile.ensureIndex({ fieldName: 'expire', expireAfterSeconds: 0 }); // Auto-expire events
        obj.serverstatsfile.remove({ time: { '$lt': new Date(Date.now() - (expireServerStatsSeconds * 1000)) } }, { multi: true }); // Force delete older events

        // Setup plugin info collection
        if (obj.pluginsActive) {
            obj.pluginsfile = new Datastore({ filename: parent.getConfigFilePath('meshcentral-plugins.db'), autoload: true });
            obj.pluginsfile.persistence.setAutocompactionInterval(86400000); // Compact once a day
        }

        setupFunctions(func); // Completed setup of NeDB
    }

    // Check the object names for a "."
    function checkObjectNames(r, tag) {
        if (typeof r != 'object') return;
        for (var i in r) {
            if (i.indexOf('.') >= 0) { throw ('BadDbName (' + tag + '): ' + JSON.stringify(r)); }
            checkObjectNames(r[i], tag);
        }
    }

    // Query the database
    function sqlDbQuery(query, args, func) {
        if (obj.databaseType == 4) { // MariaDB
            Datastore.getConnection()
                .then(function (conn) {
                    conn.query(query, args)
                        .then(function (rows) {
                            conn.release();
                            const docs = [];
                            for (var i in rows) { if (rows[i].doc) { docs.push(performTypedRecordDecrypt((typeof rows[i].doc == 'object')? rows[i].doc : JSON.parse(rows[i].doc))); } }
                            if (func) try { func(null, docs); } catch (ex) { console.log('SQLERR1', ex); }
                        })
                        .catch(function (err) { conn.release(); if (func) try { func(err); } catch (ex) { console.log('SQLERR2', ex); } });
                }).catch(function (err) { if (func) { try { func(err); } catch (ex) { console.log('SQLERR3', ex); } } });
        } else if (obj.databaseType == 5) { // MySQL
            Datastore.query(query, args, function (error, results, fields) {
                if (error != null) {
                    if (func) try { func(error); } catch (ex) { console.log('SQLERR4', ex); }
                } else {
                    var docs = [];
                    for (var i in results) { if (results[i].doc) { docs.push(JSON.parse(results[i].doc)); } }
                    //console.log(docs);
                    if (func) { try { func(null, docs); } catch (ex) { console.log('SQLERR5', ex); } }
                }
            });
        }
    }

    // Exec on the database
    function sqlDbExec(query, args, func) {
        if (obj.databaseType == 4) { // MariaDB
            Datastore.getConnection()
                .then(function (conn) {
                    conn.query(query, args)
                        .then(function (rows) {
                            conn.release();
                            if (func) try { func(null, rows[0]); } catch (ex) { console.log(ex); }
                        })
                        .catch(function (err) { conn.release(); if (func) try { func(err); } catch (ex) { console.log(ex); } });
                    }).catch(function (err) { if (func) { try { func(err); } catch (ex) { console.log(ex); } } });
        } else if (obj.databaseType == 5) { // MySQL
            Datastore.query(query, args, function (error, results, fields) {
                if (func) try { func(error, results[0]); } catch (ex) { console.log(ex); }
            });
        }
    }

    // Execute a batch of commands on the database
    function sqlDbBatchExec(queries, func) {
        if (obj.databaseType == 4) { // MariaDB
            Datastore.getConnection()
                .then(function (conn) {
                    var Promises = [];
                    for (var i in queries) { if (typeof queries[i] == 'string') { Promises.push(conn.query(queries[i])); } else { Promises.push(conn.query(queries[i][0], queries[i][1])); } }
                    Promise.all(Promises)
                        .then(function (rows) { conn.release(); if (func) { try { func(null); } catch (ex) { console.log(ex); } } })
                        .catch(function (err) { conn.release(); if (func) { try { func(err); } catch (ex) { console.log(ex); } } });
                })
                .catch(function (err) { if (func) { try { func(err); } catch (ex) { console.log(ex); } } });
        } else if (obj.databaseType == 5) { // MySQL
            var Promises = [];
            for (var i in queries) { if (typeof queries[i] == 'string') { Promises.push(Datastore.query(queries[i])); } else { Promises.push(Datastore.query(queries[i][0], queries[i][1])); } }
            Promise.all(Promises)
                .then(function (error, results, fields) { if (func) { try { func(error, results); } catch (ex) { console.log(ex); } } })
                .catch(function (error, results, fields) { if (func) { try { func(error); } catch (ex) { console.log(ex); } } });
        }
    }

    function setupFunctions(func) {
        if ((obj.databaseType == 4) || (obj.databaseType == 5)) {
            // Database actions on the main collection (MariaDB or MySQL)
            obj.Set = function (value, func) {
                var extra = null, extraex = null;
                value = common.escapeLinksFieldNameEx(value);
                if (value.meshid) { extra = value.meshid; } else if (value.email) { extra = 'email/' + value.email; } else if (value.nodeid) { extra = value.nodeid; }
                if ((value.type == 'node') && (value.intelamt != null) && (value.intelamt.uuid != null)) { extraex = 'uuid/' + value.intelamt.uuid; }
                if (value._id == null) { value._id = require('crypto').randomBytes(16).toString('hex'); }
                sqlDbQuery('REPLACE INTO meshcentral.main VALUE (?, ?, ?, ?, ?, ?)', [value._id, (value.type ? value.type : null), ((value.domain != null) ? value.domain : null), extra, extraex, JSON.stringify(performTypedRecordEncrypt(value))], func);
            }
            obj.Get = function (_id, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE id = ?', [_id], function (err, docs) { if ((docs != null) && (docs.length > 0) && (docs[0].links != null)) { docs[0] = common.unEscapeLinksFieldName(docs[0]); } func(err, docs); }); }
            obj.GetAll = function (func) { sqlDbQuery('SELECT domain, doc FROM meshcentral.main', null, func); }
            obj.GetHash = function (id, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE id = ?', [id], func); }
            obj.GetAllTypeNoTypeField = function (type, domain, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE type = ? AND domain = ?', [type, domain], function (err, docs) { if (err == null) { for (var i in docs) { delete docs[i].type } } func(err, docs); }); };
            obj.GetAllTypeNoTypeFieldMeshFiltered = function (meshes, extrasids, domain, type, id, func) {
                if (id && (id != '')) {
                    sqlDbQuery('SELECT doc FROM meshcentral.main WHERE id = ? AND type = ? AND domain = ? AND extra IN (?)', [id, type, domain, meshes], function (err, docs) { if (err == null) { for (var i in docs) { delete docs[i].type } } func(err, docs); });
                } else {
                    if (extrasids == null) {
                        sqlDbQuery('SELECT doc FROM meshcentral.main WHERE type = ? AND domain = ? AND extra IN (?)', [type, domain, meshes], function (err, docs) { if (err == null) { for (var i in docs) { delete docs[i].type } } func(err, docs); });
                    } else {
                        sqlDbQuery('SELECT doc FROM meshcentral.main WHERE type = ? AND domain = ? AND (extra IN (?) OR id IN (?))', [type, domain, meshes, extrasids], function (err, docs) { if (err == null) { for (var i in docs) { delete docs[i].type } } func(err, docs); });
                    }
                }
            };
            obj.GetAllTypeNodeFiltered = function (nodes, domain, type, id, func) {
                if (id && (id != '')) {
                    sqlDbQuery('SELECT doc FROM meshcentral.main WHERE id = ? AND type = ? AND domain = ? AND extra IN (?)', [id, type, domain, nodes], function (err, docs) { if (err == null) { for (var i in docs) { delete docs[i].type } } func(err, docs); });
                } else {
                    sqlDbQuery('SELECT doc FROM meshcentral.main WHERE type = ? AND domain = ? AND extra IN (?)', [type, domain, nodes], function (err, docs) { if (err == null) { for (var i in docs) { delete docs[i].type } } func(err, docs); });
                }
            };
            obj.GetAllType = function (type, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE type = ?', [type], func); }
            obj.GetAllIdsOfType = function (ids, domain, type, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE id IN (?) AND domain = ? AND type = ?', [ids, domain, type], func); }
            obj.GetUserWithEmail = function (domain, email, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE domain = ? AND extra = ?', [domain, 'email/' + email], func); }
            obj.GetUserWithVerifiedEmail = function (domain, email, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE domain = ? AND extra = ?', [domain, 'email/' + email], func); }
            obj.Remove = function (id, func) { sqlDbQuery('DELETE FROM meshcentral.main WHERE id = ?', [id], func); };
            obj.RemoveAll = function (func) { sqlDbQuery('DELETE FROM meshcentral.main', null, func); };
            obj.RemoveAllOfType = function (type, func) { sqlDbQuery('DELETE FROM meshcentral.main WHERE type = ?', [type], func); };
            obj.InsertMany = function (data, func) { var pendingOps = 0; for (var i in data) { pendingOps++; obj.Set(data[i], function () { if (--pendingOps == 0) { func(); } }); } };
            obj.RemoveMeshDocuments = function (id) { sqlDbQuery('DELETE FROM meshcentral.main WHERE extra = ?', [id], function () { sqlDbQuery('DELETE FROM meshcentral.main WHERE id = ?', ['nt' + id], func); } ); };
            obj.MakeSiteAdmin = function (username, domain) { obj.Get('user/' + domain + '/' + username, function (err, docs) { if ((err == null) && (docs.length == 1)) { docs[0].siteadmin = 0xFFFFFFFF; obj.Set(docs[0]); } }); };
            obj.DeleteDomain = function (domain, func) { sqlDbQuery('DELETE FROM meshcentral.main WHERE domain = ?', [domain], func); };
            obj.SetUser = function (user) { if (user.subscriptions != null) { var u = Clone(user); if (u.subscriptions) { delete u.subscriptions; } obj.Set(u); } else { obj.Set(user); } };
            obj.dispose = function () { for (var x in obj) { if (obj[x].close) { obj[x].close(); } delete obj[x]; } };
            obj.getLocalAmtNodes = function (func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE (type = "node") AND (extraex IS NOT NULL)', null, function (err, docs) { var r = []; if (err == null) { for (var i in docs) { if (docs[i].host != null) { r.push(docs[i]); } } } func(err, r); }); };
            obj.getAmtUuidMeshNode = function (meshid, uuid, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE meshid = ? AND extraex = ?', [meshid, 'uuid/' + uuid], func); };
            obj.getAmtUuidNode = function (uuid, func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE type = "node" AND extraex = ?', ['uuid/' + uuid], func); };
            obj.isMaxType = function (max, type, domainid, func) { if (max == null) { func(false); } else { sqlDbExec('SELECT COUNT(id) FROM meshcentral.main WHERE domain = ? AND type = ?', [domainid, type], function (err, response) { func((response['COUNT(id)'] == null) || (response['COUNT(id)'] > max), response['COUNT(id)']) }); } }

            // Database actions on the events collection
            obj.GetAllEvents = function (func) { sqlDbQuery('SELECT doc FROM meshcentral.events', null, func); };
            obj.StoreEvent = function (event) {
                var batchQuery = [['INSERT INTO meshcentral.events VALUE (?, ?, ?, ?, ?, ?, ?)', [null, event.time, ((typeof event.domain == 'string') ? event.domain : null), event.action, event.nodeid ? event.nodeid : null, event.userid ? event.userid : null, JSON.stringify(event)]]];
                for (var i in event.ids) { if (event.ids[i] != '*') { batchQuery.push(['INSERT INTO meshcentral.eventids VALUE (LAST_INSERT_ID(), ?)', [event.ids[i]]]); } }
                sqlDbBatchExec(batchQuery, function (err, docs) { });
            };
            obj.GetEvents = function (ids, domain, func) {
                if (ids.indexOf('*') >= 0) {
                    sqlDbQuery('SELECT doc FROM meshcentral.events WHERE (domain = ?) ORDER BY time DESC', [domain], func);
                } else {
                    sqlDbQuery('SELECT doc FROM meshcentral.events JOIN meshcentral.eventids ON id = fkid WHERE (domain = ? AND target IN (?)) GROUP BY id ORDER BY time DESC', [domain, ids], func);
                }
            };
            obj.GetEventsWithLimit = function (ids, domain, limit, func) {
                if (ids.indexOf('*') >= 0) {
                    sqlDbQuery('SELECT doc FROM meshcentral.events WHERE (domain = ?) ORDER BY time DESC LIMIT ?', [domain, limit], func);
                } else {
                    sqlDbQuery('SELECT doc FROM meshcentral.events JOIN meshcentral.eventids ON id = fkid WHERE (domain = ? AND target IN (?)) GROUP BY id ORDER BY time DESC LIMIT ?', [domain, ids, limit], func);
                }
            };
            obj.GetUserEvents = function (ids, domain, username, func) {
                const userid = 'user/' + domain + '/' + username.toLowerCase();
                if (ids.indexOf('*') >= 0) {
                    sqlDbQuery('SELECT doc FROM meshcentral.events WHERE (domain = ? AND userid = ?) ORDER BY time DESC', [domain, userid], func);
                } else {
                    sqlDbQuery('SELECT doc FROM meshcentral.events JOIN meshcentral.eventids ON id = fkid WHERE (domain = ? AND userid = ? AND target IN (?)) GROUP BY id ORDER BY time DESC', [domain, userid, ids, limit], func);
                }
            };
            obj.GetUserEventsWithLimit = function (ids, domain, username, limit, func) {
                const userid = 'user/' + domain + '/' + username.toLowerCase();
                if (ids.indexOf('*') >= 0) {
                    sqlDbQuery('SELECT doc FROM meshcentral.events WHERE (domain = ? AND userid = ?) ORDER BY time DESC LIMIT ?', [domain, userid, limit], func);
                } else {
                    sqlDbQuery('SELECT doc FROM meshcentral.events JOIN meshcentral.eventids ON id = fkid WHERE (domain = ? AND userid = ? AND target IN (?)) GROUP BY id ORDER BY time DESC LIMIT ?', [domain, userid, ids, limit], func);
                }
            };
            obj.GetNodeEventsWithLimit = function (nodeid, domain, limit, func) { sqlDbQuery('SELECT doc FROM meshcentral.events WHERE (nodeid = ?) AND (domain = ?) ORDER BY time DESC LIMIT ?', [nodeid, domain, limit], func); };
            obj.GetNodeEventsSelfWithLimit = function (nodeid, domain, userid, limit, func) { sqlDbQuery('SELECT doc FROM meshcentral.events WHERE (nodeid = ?) AND (domain = ?) AND ((userid = ?) OR (userid IS NULL)) ORDER BY time DESC LIMIT ?', [nodeid, domain, userid, limit], func); };
            obj.RemoveAllEvents = function (domain) { sqlDbQuery('DELETE FROM meshcentral.events', null, function (err, docs) { }); };
            obj.RemoveAllNodeEvents = function (domain, nodeid) { sqlDbQuery('DELETE FROM meshcentral.events WHERE domain = ? AND nodeid = ?', [domain, nodeid], function (err, docs) { }); };
            obj.RemoveAllUserEvents = function (domain, userid) { sqlDbQuery('DELETE FROM meshcentral.events WHERE domain = ? AND userid = ?', [domain, userid], function (err, docs) { }); };
            obj.GetFailedLoginCount = function (username, domainid, lastlogin, func) { sqlDbExec('SELECT COUNT(id) FROM meshcentral.events WHERE action = "authfail" AND domain = ? AND userid = ? AND time > ?', [domainid, 'user/' + domainid + '/' + username.toLowerCase(), lastlogin], function (err, response) { func(err == null ? response['COUNT(id)'] : 0); }); }

            // Database actions on the power collection
            obj.getAllPower = function (func) { sqlDbQuery('SELECT doc FROM meshcentral.power', null, func); };
            obj.storePowerEvent = function (event, multiServer, func) { if (multiServer != null) { event.server = multiServer.serverid; } sqlDbQuery('INSERT INTO meshcentral.power VALUE (?, ?, ?, ?)', [null, event.time, event.nodeid ? event.nodeid : null, JSON.stringify(event)], func); };
            obj.getPowerTimeline = function (nodeid, func) { sqlDbQuery('SELECT doc FROM meshcentral.power WHERE ((nodeid = ?) OR (nodeid = "*")) ORDER BY time DESC', [nodeid], func); };
            obj.removeAllPowerEvents = function () { sqlDbQuery('DELETE FROM meshcentral.power', null, function (err, docs) { }); };
            obj.removeAllPowerEventsForNode = function (nodeid) { sqlDbQuery('DELETE FROM meshcentral.power WHERE nodeid = ?', [nodeid], function (err, docs) { }); };

            // Database actions on the SMBIOS collection
            obj.GetAllSMBIOS = function (func) { sqlDbQuery('SELECT doc FROM meshcentral.smbios', null, func); };
            obj.SetSMBIOS = function (smbios, func) { var expire = new Date(smbios.time); expire.setMonth(expire.getMonth() + 6); sqlDbQuery('REPLACE INTO meshcentral.smbios VALUE (?, ?, ?, ?)', [smbios._id, smbios.time, expire, JSON.stringify(smbios)], func); };
            obj.RemoveSMBIOS = function (id) { sqlDbQuery('DELETE FROM meshcentral.smbios WHERE id = ?', [id], function (err, docs) { }); };
            obj.GetSMBIOS = function (id, func) { sqlDbQuery('SELECT doc FROM meshcentral.smbios WHERE id = ?', [id], func); };

            // Database actions on the Server Stats collection
            obj.SetServerStats = function (data, func) { sqlDbQuery('REPLACE INTO meshcentral.serverstats VALUE (?, ?, ?)', [data.time, data.expire, JSON.stringify(data)], func); };
            obj.GetServerStats = function (hours, func) { var t = new Date(); t.setTime(t.getTime() - (60 * 60 * 1000 * hours)); sqlDbQuery('SELECT doc FROM meshcentral.main WHERE time < ?', [t], func); }; // TODO: Expire old entries

            // Read a configuration file from the database
            obj.getConfigFile = function (path, func) { obj.Get('cfile/' + path, func); }

            // Write a configuration file to the database
            obj.setConfigFile = function (path, data, func) { obj.Set({ _id: 'cfile/' + path, type: 'cfile', data: data.toString('base64') }, func); }

            // List all configuration files
            obj.listConfigFiles = function (func) { sqlDbQuery('SELECT doc FROM meshcentral.main WHERE type = "cfile" ORDER BY id', func); }

            // Get all configuration files
            obj.getAllConfigFiles = function (password, func) {
                obj.file.find({ type: 'cfile' }).toArray(function (err, docs) {
                    if (err != null) { func(null); return; }
                    var r = null;
                    for (var i = 0; i < docs.length; i++) {
                        var name = docs[i]._id.split('/')[1];
                        var data = obj.decryptData(password, docs[i].data);
                        if (data != null) { if (r == null) { r = {}; } r[name] = data; }
                    }
                    func(r);
                });
            }
            
            // Get database information (TODO: Complete this)
            obj.getDbStats = function (func) {
                obj.stats = { c: 4 };
                sqlDbExec('SELECT COUNT(id) FROM meshcentral.main', null, function (err, response) { obj.stats.meshcentral = response['COUNT(id)']; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                sqlDbExec('SELECT COUNT(time) FROM meshcentral.serverstats', null, function (err, response) { obj.stats.serverstats = response['COUNT(time)']; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                sqlDbExec('SELECT COUNT(id) FROM meshcentral.power', null, function (err, response) { obj.stats.power = response['COUNT(id)']; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                sqlDbExec('SELECT COUNT(id) FROM meshcentral.smbios', null, function (err, response) { obj.stats.smbios = response['COUNT(id)']; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
            }

            // Plugin operations
            if (obj.pluginsActive) {
                obj.addPlugin = function (plugin, func) { sqlDbQuery('INSERT INTO meshcentral.plugin VALUE (?, ?)', [null, JSON.stringify(value)], func); }; // Add a plugin
                obj.getPlugins = function (func) { sqlDbQuery('SELECT doc FROM meshcentral.plugin', null, func); }; // Get all plugins
                obj.getPlugin = function (id, func) { sqlDbQuery('SELECT doc FROM meshcentral.plugin WHERE id = ?', [id], func); }; // Get plugin
                obj.deletePlugin = function (id, func) { sqlDbQuery('DELETE FROM meshcentral.plugin WHERE id = ?', [id], func); }; // Delete plugin
                obj.setPluginStatus = function (id, status, func) { obj.getPlugin(id, function (err, docs) { if ((err == null) && (docs.length == 1)) { docs[0].status = status; obj.updatePlugin(id, docs[0], func); } }); };
                obj.updatePlugin = function (id, args, func) { delete args._id; sqlDbQuery('REPLACE INTO meshcentral.plugin VALUE (?, ?)', [id, JSON.stringify(args)], func); };
            }
        } else if (obj.databaseType == 3) {
            // Database actions on the main collection (MongoDB)
            obj.Set = function (data, func) { data = common.escapeLinksFieldNameEx(data); obj.file.replaceOne({ _id: data._id }, performTypedRecordEncrypt(data), { upsert: true }, func); };
            obj.Get = function (id, func) {
                if (arguments.length > 2) {
                    var parms = [func];
                    for (var parmx = 2; parmx < arguments.length; ++parmx) { parms.push(arguments[parmx]); }
                    var func2 = function _func2(arg1, arg2) {
                        var userCallback = _func2.userArgs.shift();
                        _func2.userArgs.unshift(arg2);
                        _func2.userArgs.unshift(arg1);
                        userCallback.apply(obj, _func2.userArgs);
                    };
                    func2.userArgs = parms;
                    obj.file.find({ _id: id }).toArray(function (err, docs) {
                        if ((docs != null) && (docs.length > 0) && (docs[0].links != null)) { docs[0] = common.unEscapeLinksFieldName(docs[0]); }
                        func2(err, performTypedRecordDecrypt(docs));
                    });
                } else {
                    obj.file.find({ _id: id }).toArray(function (err, docs) {
                        if ((docs != null) && (docs.length > 0) && (docs[0].links != null)) { docs[0] = common.unEscapeLinksFieldName(docs[0]); }
                        func(err, performTypedRecordDecrypt(docs));
                    });
                }
            };
            obj.GetAll = function (func) { obj.file.find({}).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetHash = function (id, func) { obj.file.find({ _id: id }).project({ _id: 0, hash: 1 }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetAllTypeNoTypeField = function (type, domain, func) { obj.file.find({ type: type, domain: domain }).project({ type: 0 }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetAllTypeNoTypeFieldMeshFiltered = function (meshes, extrasids, domain, type, id, func) {
                if (extrasids == null) {
                    var x = { type: type, domain: domain, meshid: { $in: meshes } };
                    if (id) { x._id = id; }
                    obj.file.find(x, { type: 0 }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); });
                } else {
                    var x = { type: type, domain: domain, $or: [ { meshid: { $in: meshes } }, { _id: { $in: extrasids } } ] };
                    if (id) { x._id = id; }
                    obj.file.find(x, { type: 0 }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); });
                }
            };
            obj.GetAllTypeNodeFiltered = function (nodes, domain, type, id, func) {
                var x = { type: type, domain: domain, nodeid: { $in: nodes } };
                if (id) { x._id = id; }
                obj.file.find(x, { type: 0 }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); });
            };
            obj.GetAllType = function (type, func) { obj.file.find({ type: type }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetAllIdsOfType = function (ids, domain, type, func) { obj.file.find({ type: type, domain: domain, _id: { $in: ids } }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetUserWithEmail = function (domain, email, func) { obj.file.find({ type: 'user', domain: domain, email: email }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetUserWithVerifiedEmail = function (domain, email, func) { obj.file.find({ type: 'user', domain: domain, email: email, emailVerified: true }).toArray(function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.Remove = function (id, func) { obj.file.deleteOne({ _id: id }, func); };
            obj.RemoveAll = function (func) { obj.file.deleteMany({}, { multi: true }, func); };
            obj.RemoveAllOfType = function (type, func) { obj.file.deleteMany({ type: type }, { multi: true }, func); };
            obj.InsertMany = function (data, func) { obj.file.insertMany(data, func); };
            obj.RemoveMeshDocuments = function (id) { obj.file.deleteMany({ meshid: id }, { multi: true }); obj.file.deleteOne({ _id: 'nt' + id }); };
            obj.MakeSiteAdmin = function (username, domain) { obj.Get('user/' + domain + '/' + username, function (err, docs) { if ((err == null) && (docs.length == 1)) { docs[0].siteadmin = 0xFFFFFFFF; obj.Set(docs[0]); } }); };
            obj.DeleteDomain = function (domain, func) { obj.file.deleteMany({ domain: domain }, { multi: true }, func); };
            obj.SetUser = function (user) { if (user.subscriptions != null) { var u = Clone(user); if (u.subscriptions) { delete u.subscriptions; } obj.Set(u); } else { obj.Set(user); } };
            obj.dispose = function () { for (var x in obj) { if (obj[x].close) { obj[x].close(); } delete obj[x]; } };
            obj.getLocalAmtNodes = function (func) { obj.file.find({ type: 'node', host: { $exists: true, $ne: null }, intelamt: { $exists: true } }).toArray(func); };
            obj.getAmtUuidMeshNode = function (meshid, uuid, func) { obj.file.find({ type: 'node', meshid: meshid, 'intelamt.uuid': uuid }).toArray(func); };
            obj.getAmtUuidNode = function (uuid, func) { obj.file.find({ type: 'node', 'intelamt.uuid': uuid }).toArray(func); };

            // TODO: Starting in MongoDB 4.0.3, you should use countDocuments() instead of count() that is deprecated. We should detect MongoDB version and switch.
            // https://docs.mongodb.com/manual/reference/method/db.collection.countDocuments/
            //obj.isMaxType = function (max, type, domainid, func) { if (max == null) { func(false); } else { obj.file.countDocuments({ type: type, domain: domainid }, function (err, count) { func((err != null) || (count > max)); }); } }
            obj.isMaxType = function (max, type, domainid, func) {
                if (obj.file.countDocuments) {
                    if (max == null) { func(false); } else { obj.file.countDocuments({ type: type, domain: domainid }, function (err, count) { func((err != null) || (count > max), count); }); }
                } else {
                    if (max == null) { func(false); } else { obj.file.count({ type: type, domain: domainid }, function (err, count) { func((err != null) || (count > max), count); }); }
                }
            }

            // Database actions on the events collection
            obj.GetAllEvents = function (func) { obj.eventsfile.find({}).toArray(func); };
            obj.StoreEvent = function (event) { obj.eventsfile.insertOne(event); };
            obj.GetEvents = function (ids, domain, func) { obj.eventsfile.find({ domain: domain, ids: { $in: ids } }).project({ type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).toArray(func); };
            obj.GetEventsWithLimit = function (ids, domain, limit, func) { obj.eventsfile.find({ domain: domain, ids: { $in: ids } }).project({ type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).limit(limit).toArray(func); };
            obj.GetUserEvents = function (ids, domain, username, func) { obj.eventsfile.find({ domain: domain, $or: [{ ids: { $in: ids } }, { username: username }] }).project({ type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).toArray(func); };
            obj.GetUserEventsWithLimit = function (ids, domain, username, limit, func) { obj.eventsfile.find({ domain: domain, $or: [{ ids: { $in: ids } }, { username: username }] }).project({ type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).limit(limit).toArray(func); };
            obj.GetNodeEventsWithLimit = function (nodeid, domain, limit, func) { obj.eventsfile.find({ domain: domain, nodeid: nodeid }).project({ type: 0, etype: 0, _id: 0, domain: 0, ids: 0, node: 0, nodeid: 0 }).sort({ time: -1 }).limit(limit).toArray(func); };
            obj.GetNodeEventsSelfWithLimit = function (nodeid, domain, userid, limit, func) { obj.eventsfile.find({ domain: domain, nodeid: nodeid, userid: { $in: [userid, null] } }).project({ type: 0, etype: 0, _id: 0, domain: 0, ids: 0, node: 0, nodeid: 0 }).sort({ time: -1 }).limit(limit).toArray(func); };
            obj.RemoveAllEvents = function (domain) { obj.eventsfile.deleteMany({ domain: domain }, { multi: true }); };
            obj.RemoveAllNodeEvents = function (domain, nodeid) { obj.eventsfile.deleteMany({ domain: domain, nodeid: nodeid }, { multi: true }); };
            obj.RemoveAllUserEvents = function (domain, userid) { obj.eventsfile.deleteMany({ domain: domain, userid: userid }, { multi: true }); };
            obj.GetFailedLoginCount = function (username, domainid, lastlogin, func) {
                if (obj.eventsfile.countDocuments) {
                    obj.eventsfile.countDocuments({ action: 'authfail', username: username, domain: domainid, time: { "$gte": lastlogin } }, function (err, count) { func((err == null) ? count : 0); });
                } else {
                    obj.eventsfile.count({ action: 'authfail', username: username, domain: domainid, time: { "$gte": lastlogin } }, function (err, count) { func((err == null) ? count : 0); });
                }
            }

            // Database actions on the power collection
            obj.getAllPower = function (func) { obj.powerfile.find({}).toArray(func); };
            obj.storePowerEvent = function (event, multiServer, func) { if (multiServer != null) { event.server = multiServer.serverid; } obj.powerfile.insertOne(event, func); };
            obj.getPowerTimeline = function (nodeid, func) { obj.powerfile.find({ nodeid: { $in: ['*', nodeid] } }).project({ _id: 0, nodeid: 0, s: 0 }).sort({ time: 1 }).toArray(func); };
            obj.removeAllPowerEvents = function () { obj.powerfile.deleteMany({}, { multi: true }); };
            obj.removeAllPowerEventsForNode = function (nodeid) { obj.powerfile.deleteMany({ nodeid: nodeid }, { multi: true }); };

            // Database actions on the SMBIOS collection
            obj.GetAllSMBIOS = function (func) { obj.smbiosfile.find({}).toArray(func); };
            obj.SetSMBIOS = function (smbios, func) { obj.smbiosfile.updateOne({ _id: smbios._id }, { $set: smbios }, { upsert: true }, func); };
            obj.RemoveSMBIOS = function (id) { obj.smbiosfile.deleteOne({ _id: id }); };
            obj.GetSMBIOS = function (id, func) { obj.smbiosfile.find({ _id: id }).toArray(func); };

            // Database actions on the Server Stats collection
            obj.SetServerStats = function (data, func) { obj.serverstatsfile.insertOne(data, func); };
            obj.GetServerStats = function (hours, func) { var t = new Date(); t.setTime(t.getTime() - (60 * 60 * 1000 * hours)); obj.serverstatsfile.find({ time: { $gt: t } }, { _id: 0, cpu: 0 }).toArray(func); };

            // Read a configuration file from the database
            obj.getConfigFile = function (path, func) { obj.Get('cfile/' + path, func); }

            // Write a configuration file to the database
            obj.setConfigFile = function (path, data, func) { obj.Set({ _id: 'cfile/' + path, type: 'cfile', data: data.toString('base64') }, func); }

            // List all configuration files
            obj.listConfigFiles = function (func) { obj.file.find({ type: 'cfile' }).sort({ _id: 1 }).toArray(func); }

            // Get all configuration files
            obj.getAllConfigFiles = function (password, func) {
                obj.file.find({ type: 'cfile' }).toArray(function (err, docs) {
                    if (err != null) { func(null); return; }
                    var r = null;
                    for (var i = 0; i < docs.length; i++) {
                        var name = docs[i]._id.split('/')[1];
                        var data = obj.decryptData(password, docs[i].data);
                        if (data != null) { if (r == null) { r = {}; } r[name] = data; }
                    }
                    func(r);
                });
            }

            // Get database information
            obj.getDbStats = function (func) {
                obj.stats = { c: 6 };
                obj.getStats(function (r) { obj.stats.recordTypes = r; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } })
                obj.file.stats().then(function (stats) { obj.stats[stats.ns] = { size: stats.size, count: stats.count, avgObjSize: stats.avgObjSize, capped: stats.capped }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } }, function () { if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                obj.eventsfile.stats().then(function (stats) { obj.stats[stats.ns] = { size: stats.size, count: stats.count, avgObjSize: stats.avgObjSize, capped: stats.capped }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } }, function () { if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                obj.powerfile.stats().then(function (stats) { obj.stats[stats.ns] = { size: stats.size, count: stats.count, avgObjSize: stats.avgObjSize, capped: stats.capped }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } }, function () { if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                obj.smbiosfile.stats().then(function (stats) { obj.stats[stats.ns] = { size: stats.size, count: stats.count, avgObjSize: stats.avgObjSize, capped: stats.capped }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } }, function () { if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                obj.serverstatsfile.stats().then(function (stats) { obj.stats[stats.ns] = { size: stats.size, count: stats.count, avgObjSize: stats.avgObjSize, capped: stats.capped }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } }, function () { if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
            }

            // Plugin operations
            if (obj.pluginsActive) {
                obj.addPlugin = function (plugin, func) { plugin.type = 'plugin'; obj.pluginsfile.insertOne(plugin, func); }; // Add a plugin
                obj.getPlugins = function (func) { obj.pluginsfile.find({ type: 'plugin' }).project({ type: 0 }).sort({ name: 1 }).toArray(func); }; // Get all plugins
                obj.getPlugin = function (id, func) { id = require('mongodb').ObjectID(id); obj.pluginsfile.find({ _id: id }).sort({ name: 1 }).toArray(func); }; // Get plugin
                obj.deletePlugin = function (id, func) { id = require('mongodb').ObjectID(id); obj.pluginsfile.deleteOne({ _id: id }, func); }; // Delete plugin
                obj.setPluginStatus = function (id, status, func) { id = require('mongodb').ObjectID(id); obj.pluginsfile.updateOne({ _id: id }, { $set: { status: status } }, func); };
                obj.updatePlugin = function (id, args, func) { delete args._id; id = require('mongodb').ObjectID(id); obj.pluginsfile.updateOne({ _id: id }, { $set: args }, func); };
            }

        } else {
            // Database actions on the main collection (NeDB and MongoJS)
            obj.Set = function (data, func) { data = common.escapeLinksFieldNameEx(data); var xdata = performTypedRecordEncrypt(data); obj.file.update({ _id: xdata._id }, xdata, { upsert: true }, func); };
            obj.Get = function (id, func) {
                if (arguments.length > 2) {
                    var parms = [func];
                    for (var parmx = 2; parmx < arguments.length; ++parmx) { parms.push(arguments[parmx]); }
                    var func2 = function _func2(arg1, arg2) {
                        var userCallback = _func2.userArgs.shift();
                        _func2.userArgs.unshift(arg2);
                        _func2.userArgs.unshift(arg1);
                        userCallback.apply(obj, _func2.userArgs);
                    };
                    func2.userArgs = parms;
                    obj.file.find({ _id: id }, function (err, docs) {
                        if ((docs != null) && (docs.length > 0) && (docs[0].links != null)) { docs[0] = common.unEscapeLinksFieldName(docs[0]); }
                        func2(err, performTypedRecordDecrypt(docs));
                    });
                } else {
                    obj.file.find({ _id: id }, function (err, docs) {
                        if ((docs != null) && (docs.length > 0) && (docs[0].links != null)) { docs[0] = common.unEscapeLinksFieldName(docs[0]); }
                        func(err, performTypedRecordDecrypt(docs));
                    });
                }
            };
            obj.GetAll = function (func) { obj.file.find({}, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetHash = function (id, func) { obj.file.find({ _id: id }, { _id: 0, hash: 1 }, func); };
            obj.GetAllTypeNoTypeField = function (type, domain, func) { obj.file.find({ type: type, domain: domain }, { type: 0 }, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            //obj.GetAllTypeNoTypeFieldMeshFiltered = function (meshes, domain, type, id, func) {
                //var x = { type: type, domain: domain, meshid: { $in: meshes } };
                //if (id) { x._id = id; }
                //obj.file.find(x, { type: 0 }, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); });
            //};
            obj.GetAllTypeNoTypeFieldMeshFiltered = function (meshes, extrasids, domain, type, id, func) {
                if (extrasids == null) {
                    var x = { type: type, domain: domain, meshid: { $in: meshes } };
                    if (id) { x._id = id; }
                    obj.file.find(x, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); });
                } else {
                    var x = { type: type, domain: domain, $or: [{ meshid: { $in: meshes } }, { _id: { $in: extrasids } }] };
                    if (id) { x._id = id; }
                    obj.file.find(x, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); });
                }
            };
            obj.GetAllTypeNodeFiltered = function (nodes, domain, type, id, func) {
                var x = { type: type, domain: domain, nodeid: { $in: nodes } };
                if (id) { x._id = id; }
                obj.file.find(x, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); });
            };
            obj.GetAllType = function (type, func) { obj.file.find({ type: type }, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetAllIdsOfType = function (ids, domain, type, func) { obj.file.find({ type: type, domain: domain, _id: { $in: ids } }, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetUserWithEmail = function (domain, email, func) { obj.file.find({ type: 'user', domain: domain, email: email }, { type: 0 }, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.GetUserWithVerifiedEmail = function (domain, email, func) { obj.file.find({ type: 'user', domain: domain, email: email, emailVerified: true }, function (err, docs) { func(err, performTypedRecordDecrypt(docs)); }); };
            obj.Remove = function (id, func) { obj.file.remove({ _id: id }, func); };
            obj.RemoveAll = function (func) { obj.file.remove({}, { multi: true }, func); };
            obj.RemoveAllOfType = function (type, func) { obj.file.remove({ type: type }, { multi: true }, func); };
            obj.InsertMany = function (data, func) { obj.file.insert(data, func); };
            obj.RemoveMeshDocuments = function (id) { obj.file.remove({ meshid: id }, { multi: true }); obj.file.remove({ _id: 'nt' + id }); };
            obj.MakeSiteAdmin = function (username, domain) { obj.Get('user/' + domain + '/' + username, function (err, docs) { if ((err == null) && (docs.length == 1)) { docs[0].siteadmin = 0xFFFFFFFF; obj.Set(docs[0]); } }); };
            obj.DeleteDomain = function (domain, func) { obj.file.remove({ domain: domain }, { multi: true }, func); };
            obj.SetUser = function (user) { if (user.subscriptions != null) { var u = Clone(user); if (u.subscriptions) { delete u.subscriptions; } obj.Set(u); } else { obj.Set(user); } };
            obj.dispose = function () { for (var x in obj) { if (obj[x].close) { obj[x].close(); } delete obj[x]; } };
            obj.getLocalAmtNodes = function (func) { obj.file.find({ type: 'node', host: { $exists: true, $ne: null }, intelamt: { $exists: true } }, func); };
            obj.getAmtUuidMeshNode = function (meshid, uuid, func) { obj.file.find({ type: 'node', meshid: meshid, 'intelamt.uuid': uuid }, func); };
            obj.getAmtUuidNode = function (uuid, func) { obj.file.find({ type: 'node', 'intelamt.uuid': uuid }, func); };
            obj.isMaxType = function (max, type, domainid, func) { if (max == null) { func(false); } else { obj.file.count({ type: type, domain: domainid }, function (err, count) { func((err != null) || (count > max), count); }); } }

            // Database actions on the events collection
            obj.GetAllEvents = function (func) { obj.eventsfile.find({}, func); };
            obj.StoreEvent = function (event) { obj.eventsfile.insert(event); };
            obj.GetEvents = function (ids, domain, func) { if (obj.databaseType == 1) { obj.eventsfile.find({ domain: domain, ids: { $in: ids } }, { _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).exec(func); } else { obj.eventsfile.find({ domain: domain, ids: { $in: ids } }, { type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }, func); } };
            obj.GetEventsWithLimit = function (ids, domain, limit, func) { if (obj.databaseType == 1) { obj.eventsfile.find({ domain: domain, ids: { $in: ids } }, { _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).limit(limit).exec(func); } else { obj.eventsfile.find({ domain: domain, ids: { $in: ids } }, { type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).limit(limit, func); } };
            obj.GetUserEvents = function (ids, domain, username, func) {
                if (obj.databaseType == 1) {
                    obj.eventsfile.find({ domain: domain, $or: [{ ids: { $in: ids } }, { username: username }] }, { type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).exec(func);
                } else {
                    obj.eventsfile.find({ domain: domain, $or: [{ ids: { $in: ids } }, { username: username }] }, { type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }, func);
                }
            };
            obj.GetUserEventsWithLimit = function (ids, domain, username, limit, func) {
                if (obj.databaseType == 1) {
                    obj.eventsfile.find({ domain: domain, $or: [{ ids: { $in: ids } }, { username: username }] }, { type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).limit(limit).exec(func);
                } else {
                    obj.eventsfile.find({ domain: domain, $or: [{ ids: { $in: ids } }, { username: username }] }, { type: 0, _id: 0, domain: 0, ids: 0, node: 0 }).sort({ time: -1 }).limit(limit, func);
                }
            };
            obj.GetNodeEventsWithLimit = function (nodeid, domain, limit, func) { if (obj.databaseType == 1) { obj.eventsfile.find({ domain: domain, nodeid: nodeid }, { type: 0, etype: 0, _id: 0, domain: 0, ids: 0, node: 0, nodeid: 0 }).sort({ time: -1 }).limit(limit).exec(func); } else { obj.eventsfile.find({ domain: domain, nodeid: nodeid }, { type: 0, etype: 0, _id: 0, domain: 0, ids: 0, node: 0, nodeid: 0 }).sort({ time: -1 }).limit(limit, func); } };
            obj.GetNodeEventsSelfWithLimit = function (nodeid, domain, userid, limit, func) { if (obj.databaseType == 1) { obj.eventsfile.find({ domain: domain, nodeid: nodeid, userid: { $in: [userid, null] } }, { type: 0, etype: 0, _id: 0, domain: 0, ids: 0, node: 0, nodeid: 0 }).sort({ time: -1 }).limit(limit).exec(func); } else { obj.eventsfile.find({ domain: domain, nodeid: nodeid }, { type: 0, etype: 0, _id: 0, domain: 0, ids: 0, node: 0, nodeid: 0 }).sort({ time: -1 }).limit(limit, func); } };
            obj.RemoveAllEvents = function (domain) { obj.eventsfile.remove({ domain: domain }, { multi: true }); };
            obj.RemoveAllNodeEvents = function (domain, nodeid) { obj.eventsfile.remove({ domain: domain, nodeid: nodeid }, { multi: true }); };
            obj.RemoveAllUserEvents = function (domain, userid) { obj.eventsfile.remove({ domain: domain, userid: userid }, { multi: true }); };
            obj.GetFailedLoginCount = function (username, domainid, lastlogin, func) { obj.eventsfile.count({ action: 'authfail', username: username, domain: domainid, time: { "$gte": lastlogin } }, function (err, count) { func((err == null) ? count : 0); }); }

            // Database actions on the power collection
            obj.getAllPower = function (func) { obj.powerfile.find({}, func); };
            obj.storePowerEvent = function (event, multiServer, func) { if (multiServer != null) { event.server = multiServer.serverid; } obj.powerfile.insert(event, func); };
            obj.getPowerTimeline = function (nodeid, func) { if (obj.databaseType == 1) { obj.powerfile.find({ nodeid: { $in: ['*', nodeid] } }, { _id: 0, nodeid: 0, s: 0 }).sort({ time: 1 }).exec(func); } else { obj.powerfile.find({ nodeid: { $in: ['*', nodeid] } }, { _id: 0, nodeid: 0, s: 0 }).sort({ time: 1 }, func); } };
            obj.removeAllPowerEvents = function () { obj.powerfile.remove({}, { multi: true }); };
            obj.removeAllPowerEventsForNode = function (nodeid) { obj.powerfile.remove({ nodeid: nodeid }, { multi: true }); };

            // Database actions on the SMBIOS collection
            if (obj.smbiosfile != null) {
                obj.GetAllSMBIOS = function (func) { obj.smbiosfile.find({}, func); };
                obj.SetSMBIOS = function (smbios, func) { obj.smbiosfile.update({ _id: smbios._id }, smbios, { upsert: true }, func); };
                obj.RemoveSMBIOS = function (id) { obj.smbiosfile.remove({ _id: id }); };
                obj.GetSMBIOS = function (id, func) { obj.smbiosfile.find({ _id: id }, func); };
            }

            // Database actions on the Server Stats collection
            obj.SetServerStats = function (data, func) { obj.serverstatsfile.insert(data, func); };
            obj.GetServerStats = function (hours, func) { var t = new Date(); t.setTime(t.getTime() - (60 * 60 * 1000 * hours)); obj.serverstatsfile.find({ time: { $gt: t } }, { _id: 0, cpu: 0 }, func); };

            // Read a configuration file from the database
            obj.getConfigFile = function (path, func) { obj.Get('cfile/' + path, func); }

            // Write a configuration file to the database
            obj.setConfigFile = function (path, data, func) { obj.Set({ _id: 'cfile/' + path, type: 'cfile', data: data.toString('base64') }, func); }

            // List all configuration files
            obj.listConfigFiles = function (func) { obj.file.find({ type: 'cfile' }).sort({ _id: 1 }).exec(func); }

            // Get all configuration files
            obj.getAllConfigFiles = function (password, func) {
                obj.file.find({ type: 'cfile' }, function (err, docs) {
                    if (err != null) { func(null); return; }
                    var r = null;
                    for (var i = 0; i < docs.length; i++) {
                        var name = docs[i]._id.split('/')[1];
                        var data = obj.decryptData(password, docs[i].data);
                        if (data != null) { if (r == null) { r = {}; } r[name] = data; }
                    }
                    func(r);
                });
            }

            // Get database information
            obj.getDbStats = function (func) {
                obj.stats = { c: 5 };
                obj.getStats(function (r) { obj.stats.recordTypes = r; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } })
                obj.file.count({}, function (err, count) { obj.stats.meshcentral = { count: count }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                obj.eventsfile.count({}, function (err, count) { obj.stats.events = { count: count }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                obj.powerfile.count({}, function (err, count) { obj.stats.power = { count: count }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
                obj.serverstatsfile.count({}, function (err, count) { obj.stats.serverstats = { count: count }; if (--obj.stats.c == 0) { delete obj.stats.c; func(obj.stats); } });
            }

            // Plugin operations
            if (obj.pluginsActive) {
                obj.addPlugin = function (plugin, func) { plugin.type = 'plugin'; obj.pluginsfile.insert(plugin, func); }; // Add a plugin
                obj.getPlugins = function (func) { obj.pluginsfile.find({ 'type': 'plugin' }, { 'type': 0 }).sort({ name: 1 }).exec(func); }; // Get all plugins
                obj.getPlugin = function (id, func) { obj.pluginsfile.find({ _id: id }).sort({ name: 1 }).exec(func); }; // Get plugin
                obj.deletePlugin = function (id, func) { obj.pluginsfile.remove({ _id: id }, func); }; // Delete plugin
                obj.setPluginStatus = function (id, status, func) { obj.pluginsfile.update({ _id: id }, { $set: { status: status } }, func); };
                obj.updatePlugin = function (id, args, func) { delete args._id; obj.pluginsfile.update({ _id: id }, { $set: args }, func); };
            }

        }

        func(obj); // Completed function setup
    }

    // Return a human readable string with current backup configuration
    obj.getBackupConfig = function () {
        var r = '', backupPath = parent.backuppath;
        if (parent.config.settings.autobackup && parent.config.settings.autobackup.backuppath) { backupPath = parent.config.settings.autobackup.backuppath; }
        const dbname = (parent.args.mongodbname) ? (parent.args.mongodbname) : 'meshcentral';
        const currentDate = new Date();
        const fileSuffix = currentDate.getFullYear() + '-' + padNumber(currentDate.getMonth() + 1, 2) + '-' + padNumber(currentDate.getDate(), 2) + '-' + padNumber(currentDate.getHours(), 2) + '-' + padNumber(currentDate.getMinutes(), 2);
        const newAutoBackupFile = 'meshcentral-autobackup-' + fileSuffix;
        const newAutoBackupPath = parent.path.join(backupPath, newAutoBackupFile);

        r += 'DB Name: ' + dbname + '\r\n';
        r += 'DB Type: ' + ['None', 'NeDB', 'MongoJS', 'MongoDB'][obj.databaseType] + '\r\n';
        r += 'BackupPath: ' + backupPath + '\r\n';
        r += 'newAutoBackupFile: ' + newAutoBackupFile + '\r\n';
        r += 'newAutoBackupPath: ' + newAutoBackupPath + '\r\n';

        if (parent.config.settings.autobackup == null) {
            r += 'No Settings/AutoBackup\r\n';
        } else {
            if (parent.config.settings.autobackup.backupintervalhours != null) {
                if (typeof parent.config.settings.autobackup.backupintervalhours != 'number') { r += 'Bad backupintervalhours type\r\n'; }
                else { r += 'Backup Interval (Hours): ' + parent.config.settings.autobackup.backupintervalhours + '\r\n'; }
            }
            if (parent.config.settings.autobackup.keeplastdaysbackup != null) {
                if (typeof parent.config.settings.autobackup.keeplastdaysbackup != 'number') { r += 'Bad keeplastdaysbackup type\r\n'; }
                else { r += 'Keep Last Backups (Days): ' + parent.config.settings.autobackup.keeplastdaysbackup + '\r\n'; }
            }
            if (parent.config.settings.autobackup.zippassword != null) {
                if (typeof parent.config.settings.autobackup.zippassword != 'string') { r += 'Bad zippassword type\r\n'; }
                else { r += 'ZIP Password Set\r\n'; }
            }
            if (parent.config.settings.autobackup.mongodumppath != null) {
                if (typeof parent.config.settings.autobackup.mongodumppath != 'string') { r += 'Bad mongodumppath type\r\n'; }
                else { r += 'MongoDump Path: ' + parent.config.settings.autobackup.mongodumppath + '\r\n'; }
            }
        }

        return r;
    }

    obj.performingBackup = false;
    obj.performBackup = function (func) {
        try {
            if (obj.performingBackup) return 1;
            obj.performingBackup = true;
            //console.log('Performing backup...');

            var backupPath = parent.backuppath;
            if (parent.config.settings.autobackup && parent.config.settings.autobackup.backuppath) { backupPath = parent.config.settings.autobackup.backuppath; }
            try { parent.fs.mkdirSync(backupPath); } catch (e) { }
            const dbname = (parent.args.mongodbname) ? (parent.args.mongodbname) : 'meshcentral';
            const dburl = parent.args.mongodb;
            const currentDate = new Date();
            const fileSuffix = currentDate.getFullYear() + '-' + padNumber(currentDate.getMonth() + 1, 2) + '-' + padNumber(currentDate.getDate(), 2) + '-' + padNumber(currentDate.getHours(), 2) + '-' + padNumber(currentDate.getMinutes(), 2);
            const newAutoBackupFile = 'meshcentral-autobackup-' + fileSuffix;
            const newAutoBackupPath = parent.path.join(backupPath, newAutoBackupFile);

            if ((obj.databaseType == 2) || (obj.databaseType == 3)) {
                // Perform a MongoDump backup
                const newBackupFile = 'mongodump-' + fileSuffix;
                var newBackupPath = parent.path.join(backupPath, newBackupFile);
                var mongoDumpPath = 'mongodump';
                if (parent.config.settings.autobackup && parent.config.settings.autobackup.mongodumppath) { mongoDumpPath = parent.config.settings.autobackup.mongodumppath; }
                const child_process = require('child_process');
                var cmd = '\"' + mongoDumpPath + '\" --db=\"' + dbname + '\" --archive=\"' + newBackupPath + '.archive\"';
                if (dburl) { cmd = '\"' + mongoDumpPath + '\" --uri=\"' + dburl + '\" --archive=\"' + newBackupPath + '.archive\"'; }
                var backupProcess = child_process.exec(cmd, { cwd: backupPath }, function (error, stdout, stderr) {
                    try {
                        backupProcess = null;
                        if ((error != null) && (error != '')) { console.log('ERROR: Unable to perform database backup: ' + error + '\r\n'); obj.performingBackup = false; return; }

                        // Perform archive compression
                        var archiver = require('archiver');
                        var output = parent.fs.createWriteStream(newAutoBackupPath + '.zip');
                        var archive = null;
                        if (parent.config.settings.autobackup && (typeof parent.config.settings.autobackup.zippassword == 'string')) {
                            try { archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted")); } catch (ex) { }
                            archive = archiver.create('zip-encrypted', { zlib: { level: 9 }, encryptionMethod: 'aes256', password: parent.config.settings.autobackup.zippassword });
                        } else {
                            archive = archiver('zip', { zlib: { level: 9 } });
                        }
                        output.on('close', function () { obj.performingBackup = false; if (func) { func('Auto-backup completed.'); } obj.performCloudBackup(newAutoBackupPath + '.zip', func); setTimeout(function () { try { parent.fs.unlink(newBackupPath + '.archive', function () { }); } catch (ex) { console.log(ex); } }, 5000); });
                        output.on('end', function () { });
                        archive.on('warning', function (err) { console.log('Backup warning: ' + err); if (func) { func('Backup warning: ' + err); } });
                        archive.on('error', function (err) { console.log('Backup error: ' + err); if (func) { func('Backup error: ' + err); } });
                        archive.pipe(output);
                        archive.file(newBackupPath + '.archive', { name: newBackupFile + '.archive' });
                        archive.directory(parent.datapath, 'meshcentral-data');
                        archive.finalize();
                    } catch (ex) { console.log(ex); }
                });
            } else {
                // Perform a NeDB backup
                var archiver = require('archiver');
                var output = parent.fs.createWriteStream(newAutoBackupPath + '.zip');
                var archive = null;
                if (parent.config.settings.autobackup && (typeof parent.config.settings.autobackup.zippassword == 'string')) {
                    try { archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted")); } catch (ex) { }
                    archive = archiver.create('zip-encrypted', { zlib: { level: 9 }, encryptionMethod: 'aes256', password: parent.config.settings.autobackup.zippassword });
                } else {
                    archive = archiver('zip', { zlib: { level: 9 } });
                }
                output.on('close', function () { obj.performingBackup = false; if (func) { func('Auto-backup completed.'); } obj.performCloudBackup(newAutoBackupPath + '.zip', func); });
                output.on('end', function () { });
                archive.on('warning', function (err) { console.log('Backup warning: ' + err); if (func) { func('Backup warning: ' + err); } });
                archive.on('error', function (err) { console.log('Backup error: ' + err); if (func) { func('Backup error: ' + err); } });
                archive.pipe(output);
                archive.directory(parent.datapath, 'meshcentral-data');
                archive.finalize();
            }

            // Remove old backups
            if (parent.config.settings.autobackup && (typeof parent.config.settings.autobackup.keeplastdaysbackup == 'number')) {
                var cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - parent.config.settings.autobackup.keeplastdaysbackup);
                parent.fs.readdir(parent.backuppath, function (err, dir) {
                    try {
                        if ((err == null) && (dir.length > 0)) {
                            for (var i in dir) {
                                var name = dir[i];
                                if (name.startsWith('meshcentral-autobackup-') && name.endsWith('.zip')) {
                                    var timex = name.substring(23, name.length - 4).split('-');
                                    if (timex.length == 5) {
                                        var fileDate = new Date(parseInt(timex[0]), parseInt(timex[1]) - 1, parseInt(timex[2]), parseInt(timex[3]), parseInt(timex[4]));
                                        if (fileDate && (cutoffDate > fileDate)) { try { parent.fs.unlink(parent.path.join(parent.backuppath, name), function () { }); } catch (ex) { } }
                                    }
                                }
                            }
                        }
                    } catch (ex) { console.log(ex); }
                });
            }
        } catch (ex) { console.log(ex); }
        return 0;
    }

    // Perform cloud backup
    obj.performCloudBackup = function (filename, func) {

        // WebDAV Backup
        if ((typeof parent.config.settings.autobackup == 'object') && (typeof parent.config.settings.autobackup.webdav == 'object')) {
            const xdateTimeSort = function (a, b) { if (a.xdate > b.xdate) return 1; if (a.xdate < b.xdate) return -1; return 0; }

            // Fetch the folder name
            var webdavfolderName = 'MeshCentral-Backups';
            if (typeof parent.config.settings.autobackup.webdav.foldername == 'string') { webdavfolderName = parent.config.settings.autobackup.webdav.foldername; }

            // Clean up our WebDAV folder
            function performWebDavCleanup(client) {
                if ((typeof parent.config.settings.autobackup.webdav.maxfiles == 'number') && (parent.config.settings.autobackup.webdav.maxfiles > 1)) {
                    var directoryItems = client.getDirectoryContents(webdavfolderName);
                    directoryItems.then(
                        function (files) {
                            for (var i in files) { files[i].xdate = new Date(files[i].lastmod); }
                            files.sort(xdateTimeSort);
                            while (files.length >= parent.config.settings.autobackup.webdav.maxfiles) {
                                client.deleteFile(files.shift().filename).then(function (state) {
                                    if (func) { func('WebDAV file deleted.'); }
                                }).catch(function (err) {
                                    if (func) { func('WebDAV (deleteFile) error: ' + err); }
                                });
                            }
                        }
                    ).catch(function (err) {
                        if (func) { func('WebDAV (getDirectoryContents) error: ' + err); }
                    });
                }
            }

            // Upload to the WebDAV folder
            function performWebDavUpload(client, filepath) {
                var fileStream = require('fs').createReadStream(filepath);
                fileStream.on('close', function () { if (func) { func('WebDAV upload completed'); } })
                fileStream.on('error', function (err) { if (func) { func('WebDAV (fileUpload) error: ' + err); } })
                fileStream.pipe(client.createWriteStream('/' + webdavfolderName + '/' + require('path').basename(filepath)));
                if (func) { func('Uploading using WebDAV...'); }
            }

            if (func) { func('Attempting WebDAV upload...'); }
            const { createClient } = require('webdav');
            const client = createClient(parent.config.settings.autobackup.webdav.url, { username: parent.config.settings.autobackup.webdav.username, password: parent.config.settings.autobackup.webdav.password });
            var directoryItems = client.getDirectoryContents('/');
            directoryItems.then(
                function (files) {
                    var folderFound = false;
                    for (var i in files) { if ((files[i].basename == webdavfolderName) && (files[i].type == 'directory')) { folderFound = true; } }
                    if (folderFound == false) {
                        client.createDirectory(webdavfolderName).then(function (a) {
                            if (a.statusText == 'Created') {
                                if (func) { func('WebDAV folder created'); }
                                performWebDavUpload(client, filename);
                            } else {
                                if (func) { func('WebDAV (createDirectory) status: ' + a.statusText); }
                            }
                        }).catch(function (err) {
                            if (func) { func('WebDAV (createDirectory) error: ' + err); }
                        });
                    } else {
                        performWebDavCleanup(client);
                        performWebDavUpload(client, filename);
                    }
                }
            ).catch(function (err) {
                if (func) { func('WebDAV (getDirectoryContents) error: ' + err); }
            });
        }

        // Google Drive Backup
        if ((typeof parent.config.settings.autobackup == 'object') && (typeof parent.config.settings.autobackup.googledrive == 'object')) {
            obj.Get('GoogleDriveBackup', function (err, docs) {
                if ((err != null) || (docs.length != 1) || (docs[0].state != 3)) return;
                if (func) { func('Attempting Google Drive upload...'); }
                const {google} = require('googleapis');
                const oAuth2Client = new google.auth.OAuth2(docs[0].clientid, docs[0].clientsecret, "urn:ietf:wg:oauth:2.0:oob");
                oAuth2Client.on('tokens', function (tokens) { if (tokens.refresh_token) { docs[0].token = tokens.refresh_token; parent.db.Set(docs[0]); } }); // Update the token in the database
                oAuth2Client.setCredentials(docs[0].token);
                const drive = google.drive({ version: 'v3', auth: oAuth2Client });
                const createdTimeSort = function (a, b) { if (a.createdTime > b.createdTime) return 1; if (a.createdTime < b.createdTime) return -1; return 0; }

                // Called once we know our folder id, clean up and upload a backup.
                var useGoogleDrive = function (folderid) {
                    // List files to see if we need to delete older ones
                    if (typeof parent.config.settings.autobackup.googledrive.maxfiles == 'number') {
                        drive.files.list({
                            q: 'trashed = false and \'' + folderid + '\' in parents',
                            fields: 'nextPageToken, files(id, name, size, createdTime)',
                        }, function (err, res) {
                            if (err) {
                                console.log('GoogleDrive (files.list) error: ' + err);
                                if (func) { func('GoogleDrive (files.list) error: ' + err); }
                                return;
                            }
                            // Delete any old files if more than 10 files are present in the backup folder.
                            res.data.files.sort(createdTimeSort);
                            while (res.data.files.length >= parent.config.settings.autobackup.googledrive.maxfiles) { drive.files.delete({ fileId: res.data.files.shift().id }, function (err, res) { }); }
                        });
                    }

                    //console.log('Uploading...');
                    if (func) { func('Uploading to Google Drive...'); }

                    // Upload the backup
                    drive.files.create({
                        requestBody: { name: require('path').basename(filename), mimeType: 'text/plain', parents: [folderid] },
                        media: { mimeType: 'application/zip', body: require('fs').createReadStream(filename) },
                    }, function (err, res) {
                        if (err) {
                            console.log('GoogleDrive (files.create) error: ' + err);
                            if (func) { func('GoogleDrive (files.create) error: ' + err); }
                            return;
                        }
                        //console.log('Upload done.');
                        if (func) { func('Google Drive upload completed.'); }
                    });
                }

                // Fetch the folder name
                var folderName = 'MeshCentral-Backups';
                if (typeof parent.config.settings.autobackup.googledrive.foldername == 'string') { folderName = parent.config.settings.autobackup.googledrive.foldername; }

                // Find our backup folder, create one if needed.
                drive.files.list({
                    q: 'mimeType = \'application/vnd.google-apps.folder\' and name=\'' + folderName + '\' and trashed = false',
                    fields: 'nextPageToken, files(id, name)',
                }, function (err, res) {
                    if (err) {
                        console.log('GoogleDrive error: ' + err);
                        if (func) { func('GoogleDrive error: ' + err); }
                        return;
                    }
                    if (res.data.files.length == 0) {
                        // Create a folder
                        drive.files.create({ resource: { 'name': folderName, 'mimeType': 'application/vnd.google-apps.folder' }, fields: 'id' }, function (err, file) {
                            if (err) {
                                console.log('GoogleDrive (folder.create) error: ' + err);
                                if (func) { func('GoogleDrive (folder.create) error: ' + err); }
                                return;
                            }
                            useGoogleDrive(file.data.id);
                        });
                    } else { useGoogleDrive(res.data.files[0].id); }
                });
            });
        }
    }

    function padNumber(number, digits) { return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number; }

    // Called when a node has changed
    function dbNodeChange(nodeChange, added) {
        common.unEscapeLinksFieldName(nodeChange.fullDocument);
        const node = nodeChange.fullDocument;
        if (node.intelamt != null) { // Remove the Intel AMT password and MPS password before eventing this.
            if (node.intelamt.pass != null) { node.intelamt.pass = 1; }
            if (node.intelamt.mpspass != null) { node.intelamt.mpspass = 1; }
        } 
        parent.DispatchEvent(['*', node.meshid], obj, { etype: 'node', action: (added ? 'addnode' : 'changenode'), node: node, nodeid: node._id, domain: node.domain, nolog: 1 });
    }

    // Called when a device group has changed
    function dbMeshChange(meshChange, added) {
        if (parent.webserver == null) return;
        common.unEscapeLinksFieldName(meshChange.fullDocument);
        const mesh = meshChange.fullDocument;

        // Update the mesh object in memory
        const mmesh = parent.webserver.meshes[mesh._id];
        for (var i in mesh) { mmesh[i] = mesh[i]; }
        for (var i in mmesh) { if (mesh[i] == null) { delete mmesh[i]; } }

        // Send the mesh update
        if (mesh.deleted) { mesh.action = 'deletemesh'; } else { mesh.action = (added ? 'createmesh' : 'meshchange'); }
        mesh.meshid = mesh._id;
        mesh.nolog = 1;
        delete mesh.type;
        delete mesh._id;
        if (mesh.amt != null) {
            if (delete mesh.amt.password != null) { mesh.amt.password = 1; } // Remove the Intel AMT password if present
        }
        parent.DispatchEvent(['*', mesh.meshid], obj, mesh);
    }

    // Called when a user account has changed
    function dbUserChange(userChange, added) {
        if (parent.webserver == null) return;
        const user = userChange.fullDocument;

        // Update the user object in memory
        const muser = parent.webserver.users[user._id];
        for (var i in user) { muser[i] = user[i]; }
        for (var i in muser) { if (user[i] == null) { delete muser[i]; } }

        // Send the user update
        var targets = ['*', 'server-users', user._id];
        if (user.groups) { for (var i in user.groups) { targets.push('server-users:' + i); } }
        parent.DispatchEvent(targets, obj, { etype: 'user', username: user.name, account: parent.webserver.CloneSafeUser(user), action: (added ? 'accountcreate' : 'accountchange'), domain: user.domain, nolog: 1 });
    }

    // Called when a user group has changed
    function dbUGrpChange(ugrpChange, added) {
        if (parent.webserver == null) return;
        common.unEscapeLinksFieldName(ugrpChange.fullDocument);
        const usergroup = ugrpChange.fullDocument;

        // Update the user group object in memory
        const uusergroup = parent.webserver.usergroups[usergroup._id];
        for (var i in usergroup) { uusergroup[i] = usergroup[i]; }
        for (var i in uusergroup) { if (usergroup[i] == null) { delete uusergroup[i]; } }

        // Send the user group update
        usergroup.action = (added ? 'createusergroup' : 'usergroupchange');
        usergroup.ugrpid = usergroup._id;
        usergroup.nolog = 1;
        delete usergroup.type;
        delete usergroup._id;
        parent.DispatchEvent(['*', usergroup.ugrpid], obj, usergroup);
    }

    return obj;
};
