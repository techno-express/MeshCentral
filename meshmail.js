/**
* @description MeshCentral e-mail server communication modules
* @author Ylian Saint-Hilaire
* @copyright Intel Corporation 2018
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

// Construct a MeshAgent object, called upon connection
module.exports.CreateMeshMail = function (parent) {
    var obj = {};
    obj.pendingMails = [];
    obj.parent = parent;
    obj.retry = 0;
    obj.sendingMail = false;
    obj.mailCookieEncryptionKey = null;
    const nodemailer = require('nodemailer');

    // Default account email validation mail
    const accountCheckSubject = '[[[SERVERNAME]]] - Email Verification';
    const accountCheckMailHtml = '<div style="font-family:Arial,Helvetica,sans-serif"><table style="background-color:#003366;color:lightgray;width:100%" cellpadding=8><tr><td><b style="font-size:20px;font-family:Arial,Helvetica,sans-serif">[[[SERVERNAME]]] - Verification</b></td></tr></table><p>Hi [[[USERNAME]]], <a href="[[[SERVERURL]]]">[[[SERVERNAME]]]</a> is requesting email verification, click on the following link to complete the process.</p><p style="margin-left:30px"><a href="[[[CALLBACKURL]]]">Click here to verify your e-mail address.</a></p>If you did not initiate this request, please ignore this mail.</div>';
    const accountCheckMailText = '[[[SERVERNAME]]] - Verification\r\n\r\nHi [[[USERNAME]]], [[[SERVERNAME]]] ([[[SERVERURL]]]) is performing an e-mail verification. Nagivate to the following link to complete the process: [[[CALLBACKURL]]]\r\nIf you did not initiate this request, please ignore this mail.\r\n';

    // Default account reset mail
    const accountResetSubject = '[[[SERVERNAME]]] - Account Reset';
    const accountResetMailHtml = '<div style="font-family:Arial,Helvetica,sans-serif"><table style="background-color:#003366;color:lightgray;width:100%" cellpadding=8><tr><td><b style="font-size:20px;font-family:Arial,Helvetica,sans-serif">[[[SERVERNAME]]] - Verification</b></td></tr></table><p>Hi [[[USERNAME]]], <a href="[[[SERVERURL]]]">[[[SERVERNAME]]]</a> is requesting an account password reset, click on the following link to complete the process.</p><p style="margin-left:30px"><a href="[[[CALLBACKURL]]]">Click here to reset your account password.</a></p>If you did not initiate this request, please ignore this mail.</div>';
    const accountResetMailText = '[[[SERVERNAME]]] - Account Reset\r\n\r\nHi [[[USERNAME]]], [[[SERVERNAME]]] ([[[SERVERURL]]]) is requesting an account password reset. Nagivate to the following link to complete the process: [[[CALLBACKURL]]]\r\nIf you did not initiate this request, please ignore this mail.\r\n';


    // Email Agent template
    var emailAgentSubject = '[[[SERVERNAME]]] - Remote Support Agent';
    var emailAgentCheckMailHtml = '<div style="font-family:Arial,Helvetica,sans-serif"><table style="background-color:#003366;color:lightgray;width:100%" cellpadding=8><tr><td><b style="font-size:20px;font-family:Arial,Helvetica,sans-serif">[[[SERVERNAME]]] - Remote Support Agent</b></td></tr></table><p>Hello [[[CLIENTNAME]]], <a href="[[[SERVERURL]]]">[[[SERVERNAME]]]</a> is requesting you to download the following software to start the remote control session.</p><p style="margin-left:30px"><a href="[[[AGENTURL]]]">Click here to begin remote session.</a></p>If you did not initiate this request, please ignore this mail.<br><br>Best regards,<br>[[[USERNAME]]]<br></div>';
    var emailAgentCheckMailText = '[[[SERVERNAME]]] - Remote Support Agent\r\n\r\nHello [[[CLIENTNAME]]], [[[SERVERNAME]]] ([[[SERVERURL]]]) is requesting you to download the following software to start the remote control session. Nagivate to the following link to complete the process: [[[AGENTURL]]]\r\nIf you did not initiate this request, please ignore this mail.\r\n\rBest regards,\r\n[[[USERNAME]]]\r\n';

    // Perform email sfx agent e-mail substitution
    function mailAgentReplacements(text, domain, username, clientname, agenturl) {
        var url;
        if (domain.dns == null) {
            // Default domain or subdomain of the default.
            url = 'http' + ((obj.parent.args.notls == null) ? 's' : '') + '://' + parent.certificates.CommonName + ':' + obj.parent.args.port + domain.url;
        } else {
            // Domain with a DNS name.
            url = 'http' + ((obj.parent.args.notls == null) ? 's' : '') + '://' + domain.dns + ':' + obj.parent.args.port + domain.url;
        }
        if (agenturl != null) { text = text.split('[[[AGENTURL]]]').join(url + agenturl) }
        return text.split('[[[USERNAME]]]').join(username).split('[[[SERVERURL]]]').join(url).split('[[[SERVERNAME]]]').join(domain.title).split('[[[CLIENTNAME]]]').join(clientname);
    }    
 
    // Send email link to client/enduser to download mesh Sfx agent 
    obj.sendAgentMail = function (domain, clientemail, username, clientname, agenturl) {
        obj.pendingMails.push({ to: clientemail, from: parent.config.smtp.from, subject: mailAgentReplacements(emailAgentSubject, domain, username, clientname, agenturl ), text: mailAgentReplacements(emailAgentCheckMailText, domain, username, clientname, agenturl ), html: mailAgentReplacements(emailAgentCheckMailHtml, domain, username, clientname, agenturl ) });
        sendNextMail();
    }   
    

    // Default account invite mail
    const accountInviteSubject = '[[[SERVERNAME]]] - Invitation';
    const accountInviteMailHtml = '<div style="font-family:Arial,Helvetica,sans-serif"><table style="background-color:#003366;color:lightgray;width:100%" cellpadding=8><tr><td><b style="font-size:20px;font-family:Arial,Helvetica,sans-serif">[[[SERVERNAME]]] - Agent Installation</b></td></tr></table><p>[[[INTROHTML]]]User [[[USERNAME]]] on server <a href="[[[SERVERURL]]]">[[[SERVERNAME]]]</a> is requesting you to download the following software to start the remote control session.</p>[[[MSGHTML]]][[[AGENTHTML]]]<p>If you did not initiate this request, please ignore this mail.</p>Best regards,<br>[[[USERNAME]]]<br></div>';
    const accountInviteMailText = '[[[SERVERNAME]]] - Agent Installation Invitation\r\n\r\n[[[INTROTEXT]]]User [[[USERNAME]]] on server [[[SERVERNAME]]] ([[[SERVERURL]]]) is requesting you to download the following software to start the remote control session. [[[MSGTEXT]]][[[AGENTTEXT]]]If you did not initiate this request, please ignore this mail.\r\n\r\nBest regards,\r\n[[[USERNAME]]]\r\n';

    function EscapeHtml(x) { if (typeof x == "string") return x.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); if (typeof x == "boolean") return x; if (typeof x == "number") return x; }
    //function EscapeHtmlBreaks(x) { if (typeof x == "string") return x.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '<br />').replace(/\n/g, '').replace(/\t/g, '&nbsp;&nbsp;'); if (typeof x == "boolean") return x; if (typeof x == "number") return x; }


    // Setup mail server
    var options = { host: parent.config.smtp.host, secure: (parent.config.smtp.tls == true), tls: { rejectUnauthorized: false } };
    if (parent.config.smtp.port != null) { options.port = parent.config.smtp.port; }
    if ((parent.config.smtp.user != null) && (parent.config.smtp.pass != null)) { options.auth = { user: parent.config.smtp.user, pass: parent.config.smtp.pass }; }
    obj.smtpServer = nodemailer.createTransport(options);

    // Perform all e-mail substitution
    function mailReplacements(text, domain, username, email, options) {
        var url;
        if (domain.dns == null) {
            // Default domain or subdomain of the default.
            url = 'http' + ((obj.parent.args.notls == null) ? 's' : '') + '://' + parent.certificates.CommonName + ':' + obj.parent.args.port + domain.url;
        } else {
            // Domain with a DNS name.
            url = 'http' + ((obj.parent.args.notls == null) ? 's' : '') + '://' + domain.dns + ':' + obj.parent.args.port + domain.url;
        }
        if (options) {
            if (options.cookie == null) { options.cookie = ''; }
            if (options.agentlinkhtml == null) { options.agentlinkhtml = ''; }
            if (options.agentlinktext == null) { options.agentlinktext = ''; }
            if (options.meshid == null) { options.meshid = ''; }
            if (options.introtext == null) { options.introtext = ''; }
            if (options.introhtml == null) { options.introhtml = ''; }
            if (options.msgtext == null) { options.msgtext = ''; }
            if (options.msghtml == null) { options.msghtml = ''; }

            text = text.split('[[[CALLBACKURL]]]').join(url + 'checkmail?c=' + options.cookie);
            text = text.split('[[[AGENTHTML]]]').join(options.agentlinkhtml);
            text = text.split('[[[AGENTTEXT]]]').join(options.agentlinktext);
            text = text.split('[[[MESHID]]]').join(options.meshid);
            text = text.split('[[[INTROTEXT]]]').join(options.introtext);
            text = text.split('[[[INTROHTML]]]').join(options.introhtml);
            text = text.split('[[[MSGTEXT]]]').join(options.msgtext);
            text = text.split('[[[MSGHTML]]]').join(options.msghtml);            
        }
        return text.split('[[[USERNAME]]]').join(username).split('[[[SERVERURL]]]').join(url).split('[[[SERVERNAME]]]').join(domain.title).split('[[[EMAIL]]]').join(EscapeHtml(email)).split('[[[URL]]]').join(url);
    }

    // Send a mail
    obj.sendMail = function (to, subject, text, html) {
        obj.pendingMails.push({ to: to, from: parent.config.smtp.from, subject: subject, text: text, html: html });
        sendNextMail();
    };

    // Send account check mail
    obj.sendAccountCheckMail = function (domain, username, email) {
        if ((parent.certificates == null) || (parent.certificates.CommonName == null) || (parent.certificates.CommonName == 'un-configured')) return; // If the server name is not set, no reset possible.
        var cookie = obj.parent.encodeCookie({ u: domain.id + '/' + username, e: email, a: 1 }, obj.mailCookieEncryptionKey);
        obj.pendingMails.push({ to: email, from: parent.config.smtp.from, subject: mailReplacements(accountCheckSubject, domain, username, email), text: mailReplacements(accountCheckMailText, domain, username, email, { cookie: cookie }), html: mailReplacements(accountCheckMailHtml, domain, username, email, { cookie: cookie }) });
        sendNextMail();
    };

    // Send account reset mail
    obj.sendAccountResetMail = function (domain, username, email) {
        if ((parent.certificates == null) || (parent.certificates.CommonName == null) || (parent.certificates.CommonName == 'un-configured')) return; // If the server name is not set, don't validate the email address.
        var cookie = obj.parent.encodeCookie({ u: domain.id + '/' + username, e: email, a: 2 }, obj.mailCookieEncryptionKey);
        obj.pendingMails.push({ to: email, from: parent.config.smtp.from, subject: mailReplacements(accountResetSubject, domain, username, email), text: mailReplacements(accountResetMailText, domain, username, email, { cookie: cookie }), html: mailReplacements(accountResetMailHtml, domain, username, email, { cookie: cookie }) });
        sendNextMail();
    };

    // Send agent invite mail
    obj.sendAgentInviteMail = function (domain, username, email, meshid, name, os, msg) {
        if ((parent.certificates == null) || (parent.certificates.CommonName == null) || (parent.certificates.CommonName == 'un-configured')) return; // If the server name is not set, can't do this.
        var options = { meshid: meshid.split('/')[2] };
        var agentLinkHtml = '';
        var agentLinkText = '';
        if (os == 0 || os == 1) { // All OS or Windows
            agentLinkHtml += '<p style="margin-left:30px"><a href="[[[SERVERURL]]]/meshagents?id=3&meshid=[[[MESHID]]]&tag=mailto:[[[EMAIL]]]">Click here to download the MeshAgent for Windows.</a></p>';
            agentLinkText += 'For Windows, nagivate to the following link to complete the process:\r\n\r\n[[[SERVERURL]]]/meshagents?id=3&meshid=[[[MESHID]]]&tag=mailto:[[[EMAIL]]]\r\n\r\n';
        }
        if (os == 0 || os == 2) { // All OS or Linux
            agentLinkHtml += '<p>For Linux, cut & paste the following in a terminal to install the agent:<br/><pre style="margin-left:30px">wget -q [[[SERVERURL]]]/meshagents?script=1 --no-check-certificate -O ./meshinstall.sh && chmod 755 ./meshinstall.sh && sudo ./meshinstall.sh [[[SERVERURL]]] \'[[[MESHID]]]\'</pre></p>';
            agentLinkText += 'For Linux, cut & paste the following in a terminal to install the agent:\r\n\r\nwget -q [[[SERVERURL]]]/meshagents?script=1 --no-check-certificate -O ./meshinstall.sh && chmod 755 ./meshinstall.sh && sudo ./meshinstall.sh [[[SERVERURL]]] \'[[[MESHID]]]\'\r\n\r\n';
        }
        options.agentlinkhtml = agentLinkHtml;
        options.agentlinktext = agentLinkText;
        if ((name != null) && (name != '')) { options.introtext = 'Hello ' + name + ',\r\n\r\n'; options.introhtml = '<p>Hello ' + name + ',</p>'; }
        if ((msg != null) && (msg != '')) { options.msgtext = '\r\n\r\nMessage: ' + msg + '\r\n\r\n'; options.msghtml = '<p>Message: <b>' + msg + '</b></p>'; }
        var mail = { to: email, from: parent.config.smtp.from, subject: mailReplacements(accountInviteSubject, domain, username, email), text: mailReplacements(accountInviteMailText, domain, username, email, options), html: mailReplacements(accountInviteMailHtml, domain, username, email, options) };
        obj.pendingMails.push(mail);
        sendNextMail();
    };

    // Send out the next mail in the pending list
    function sendNextMail() {
        if ((obj.sendingMail == true) || (obj.pendingMails.length == 0)) { return; }

        var mailToSend = obj.pendingMails[0];
        obj.sendingMail = true;
        //console.log('SMTP sending mail to ' + mailToSend.to + '.');
        obj.smtpServer.sendMail(mailToSend, function (err, info) {
            //console.log(JSON.stringify(err), JSON.stringify(info));
            obj.sendingMail = false;
            if (err == null) {
                obj.pendingMails.shift();
                obj.retry = 0;
                sendNextMail(); // Send the next mail
            } else {
                obj.retry++;
                console.log('SMTP server failed: ' + JSON.stringify(err));
                if (obj.retry < 6) { setTimeout(sendNextMail, 60000); } // Wait and try again
            }
        });
    }

    // Send out the next mail in the pending list
    obj.verify = function () {
        obj.smtpServer.verify(function (err, info) {
            if (err == null) {
                console.log('SMTP mail server ' + parent.config.smtp.host + ' working as expected.');
            } else {
                console.log('SMTP mail server ' + parent.config.smtp.host + ' failed: ' + JSON.stringify(err));
            }
        });
    };

    // Load the cookie encryption key from the database
    obj.parent.db.Get('MailCookieEncryptionKey', function (err, docs) {
        if ((docs.length > 0) && (docs[0].key != null) && (obj.parent.mailtokengen == null)) {
            // Key is present, use it.
            obj.mailCookieEncryptionKey = Buffer.from(docs[0].key, 'hex');
        } else {
            // Key is not present, generate one.
            obj.mailCookieEncryptionKey = obj.parent.generateCookieKey();
            obj.parent.db.Set({ _id: 'MailCookieEncryptionKey', key: obj.mailCookieEncryptionKey.toString('hex'), time: Date.now() });
        }
    });

    return obj;
};