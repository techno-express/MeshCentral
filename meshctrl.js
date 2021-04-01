#!/usr/bin/env node

// Make sure we have the dependency modules
try { require('minimist'); } catch (ex) { console.log('Missing module "minimist", type "npm install minimist" to install it.'); return; }
try { require('ws'); } catch (ex) { console.log('Missing module "ws", type "npm install ws" to install it.'); return; }

var settings = {};
const crypto = require('crypto');
const args = require('minimist')(process.argv.slice(2));
const possibleCommands = ['listusers', 'listusersessions', 'listdevicegroups', 'listdevices', 'listusersofdevicegroup', 'serverinfo', 'userinfo', 'adduser', 'removeuser', 'adddevicegroup', 'removedevicegroup', 'editdevicegroup', 'broadcast', 'showevents', 'addusertodevicegroup', 'removeuserfromdevicegroup', 'addusertodevice', 'removeuserfromdevice', 'sendinviteemail', 'generateinvitelink', 'config', 'movetodevicegroup', 'deviceinfo', 'addusergroup', 'listusergroups', 'removeusergroup', 'runcommand', 'shell', 'upload', 'download', 'deviceopenurl', 'devicemessage', 'devicetoast', 'addtousergroup', 'removefromusergroup', 'removeallusersfromusergroup'];
if (args.proxy != null) { try { require('https-proxy-agent'); } catch (ex) { console.log('Missing module "https-proxy-agent", type "npm install https-proxy-agent" to install it.'); return; } }

if (args['_'].length == 0) {
    console.log("MeshCtrl performs command line actions on a MeshCentral server.");
    console.log("Information at: https://meshcommander.com/meshcentral");
    console.log("No action specified, use MeshCtrl like this:\r\n\r\n  meshctrl [action] [arguments]\r\n");
    console.log("Supported actions:");
    console.log("  Help [action]               - Get help on an action.");
    console.log("  ServerInfo                  - Show server information.");
    console.log("  UserInfo                    - Show user information.");
    console.log("  ListUsers                   - List user accounts.");
    console.log("  ListUserSessions            - List online users.");
    console.log("  ListUserGroups              - List user groups.");
    console.log("  ListDevices                 - List devices.");
    console.log("  ListDeviceGroups            - List device groups.");
    console.log("  ListUsersOfDeviceGroup      - List the users in a device group.");
    console.log("  DeviceInfo                  - Show information about a device.");
    console.log("  Config                      - Perform operation on config.json file.");
    console.log("  AddUser                     - Create a new user account.");
    console.log("  RemoveUser                  - Delete a user account.");
    console.log("  AddUserGroup                - Create a new user group.");
    console.log("  RemoveUserGroup             - Delete a user group.");
    console.log("  AddToUserGroup              - Add a user, device or device group to a user group.");
    console.log("  RemoveFromUserGroup         - Remove a user, device or device group from a user group.");
    console.log("  RemoveAllUsersFromUserGroup - Remove all users from a user group.");
    console.log("  AddDeviceGroup              - Create a new device group.");
    console.log("  RemoveDeviceGroup           - Delete a device group.");
    console.log("  EditDeviceGroup             - Change a device group values.");
    console.log("  MoveToDeviceGroup           - Move a device to a different device group.");
    console.log("  AddUserToDeviceGroup        - Add a user to a device group.");
    console.log("  RemoveUserFromDeviceGroup   - Remove a user from a device group.");
    console.log("  AddUserToDevice             - Add a user to a device.");
    console.log("  RemoveUserFromDevice        - Remove a user from a device.");
    console.log("  SendInviteEmail             - Send an agent install invitation email.");
    console.log("  GenerateInviteLink          - Create an invitation link.");
    console.log("  Broadcast                   - Display a message to all online users.");
    console.log("  ShowEvents                  - Display real-time server events in JSON format.");
    console.log("  RunCommand                  - Run a shell command on a remote device.");
    console.log("  Shell                       - Access command shell of a remote device.");
    console.log("  Upload                      - Upload a file to a remote device.");
    console.log("  Download                    - Download a file from a remote device.");
    console.log("  DeviceOpenUrl               - Open a URL on a remote device.");
    console.log("  DeviceMessage               - Open a message box on a remote device.");
    console.log("  DeviceToast                 - Display a toast notification on a remote device.");
    console.log("\r\nSupported login arguments:");
    console.log("  --url [wss://server]        - Server url, wss://localhost:443 is default.");
    console.log("                              - Use wss://localhost:443?key=xxx if login key is required.");
    console.log("  --loginuser [username]      - Login username, admin is default.");
    console.log("  --loginpass [password]      - Login password.");
    console.log("  --token [number]            - 2nd factor authentication token.");
    console.log("  --loginkey [hex]            - Server login key in hex.");
    console.log("  --loginkeyfile [file]       - File containing server login key in hex.");
    console.log("  --logindomain [domainid]    - Domain id, default is empty, only used with loginkey.");
    console.log("  --proxy [http://proxy:1]    - Specify an HTTP proxy.");
    return;
} else {
    settings.cmd = args['_'][0].toLowerCase();
    if ((possibleCommands.indexOf(settings.cmd) == -1) && (settings.cmd != 'help')) { console.log("Invalid command. Possible commands are: " + possibleCommands.join(', ') + '.'); return; }
    //console.log(settings.cmd);

    var ok = false;
    switch (settings.cmd) {
        case 'config': { performConfigOperations(args); return; }
        case 'serverinfo': { ok = true; break; }
        case 'userinfo': { ok = true; break; }
        case 'listusers': { ok = true; break; }
        case 'listusersessions': { ok = true; break; }
        case 'listusergroups': { ok = true; break; }
        case 'listdevicegroups': { ok = true; break; }
        case 'listdevices': { ok = true; break; }
        case 'listusersofdevicegroup': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing group id, use --id '[groupid]'")); }
            else { ok = true; }
            break;
        }
        case 'deviceinfo': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing device id, use --id '[deviceid]'")); }
            else { ok = true; }
            break;
        }
        case 'addusertodevicegroup': {
            if ((args.id == null) && (args.group == null)) { console.log(winRemoveSingleQuotes("Device group identifier missing, use --id '[groupid]' or --group [groupname]")); }
            else if (args.userid == null) { console.log("Add user to group missing useid, use --userid [userid]"); }
            else { ok = true; }
            break;
        }
        case 'removeuserfromdevicegroup': {
            if ((args.id == null) && (args.group == null)) { console.log(winRemoveSingleQuotes("Device group identifier missing, use --id '[groupid]' or --group [groupname]")); }
            else if (args.userid == null) { console.log("Remove user from group missing useid, use --userid [userid]"); }
            else { ok = true; }
            break;
        }
        case 'addusertodevice': {
            if (args.userid == null) { console.log("Add user to device missing userid, use --userid [userid]"); }
            else if (args.id == null) { console.log(winRemoveSingleQuotes("Add user to device missing device id, use --id '[deviceid]'")); }
            else { ok = true; }
            break;
        }
        case 'removeuserfromdevice': {
            if (args.userid == null) { console.log("Remove user from device missing userid, use --userid [userid]"); }
            else if (args.id == null) { console.log(winRemoveSingleQuotes("Remove user from device missing device id, use --id '[deviceid]'")); }
            else { ok = true; }
            break;
        }
        case 'adddevicegroup': {
            if (args.name == null) { console.log("Message group name, use --name [name]"); }
            else { ok = true; }
            break;
        }
        case 'editdevicegroup':
        case 'removedevicegroup': {
            if ((args.id == null) && (args.group == null)) { console.log(winRemoveSingleQuotes("Device group identifier missing, use --id '[groupid]' or --group [groupname]")); }
            else { ok = true; }
            break;
        }
        case 'movetodevicegroup': {
            if ((args.id == null) && (args.group == null)) { console.log(winRemoveSingleQuotes("Device group identifier missing, use --id '[groupid]' or --group [groupname]")); }
            else if (args.devid == null) { console.log(winRemoveSingleQuotes("Device identifier missing, use --devid '[deviceid]'")); }
            else { ok = true; }
            break;
        }
        case 'broadcast': {
            if (args.msg == null) { console.log("Message missing, use --msg [message]"); }
            else { ok = true; }
            break;
        }
        case 'showevents': {
            ok = true;
            break;
        }
        case 'adduser': {
            if (args.user == null) { console.log("New account name missing, use --user [name]"); }
            else if ((args.pass == null) && (args.randompass == null)) { console.log("New account password missing, use --pass [password] or --randompass"); }
            else { ok = true; }
            break;
        }
        case 'removeuser': {
            if (args.userid == null) { console.log("Remove account userid missing, use --userid [id]"); }
            else { ok = true; }
            break;
        }
        case 'addusergroup': {
            if (args.name == null) { console.log("New user group name missing, use --name [name]"); }
            else { ok = true; }
            break;
        }
        case 'removeusergroup': {
            if (args.groupid == null) { console.log(winRemoveSingleQuotes("Remove user group id missing, use --groupid '[id]'")); }
            else { ok = true; }
            break;
        }
        case 'addtousergroup': {
            if (args.groupid == null) { console.log(winRemoveSingleQuotes("Group id missing, use --groupid '[id]'")); }
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing identifier to add, use --id [id]")); }
            else { ok = true; }
            break;
        }
        case 'removefromusergroup': {
            if (args.groupid == null) { console.log(winRemoveSingleQuotes("Group id missing, use --groupid '[id]'")); }
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing identifier to remove, use --id [id]")); }
            else { ok = true; }
            break;
        }
        case 'removeallusersfromusergroup': {
            if (args.groupid == null) { console.log(winRemoveSingleQuotes("Group id missing, use --groupid '[id]'")); }
            else { ok = true; }
            break;
        }
        case 'sendinviteemail': {
            if ((args.id == null) && (args.group == null)) { console.log("Device group identifier missing, use --id '[groupid]' or --group [groupname]"); }
            else if (args.email == null) { console.log("Device email is missing, use --email [email]"); }
			else { ok = true; }
            break;
        }
        case 'generateinvitelink': {
            if ((args.id == null) && (args.group == null)) { console.log("Device group identifier missing, use --id '[groupid]' or --group [groupname]"); }
            else if (args.hours == null) { console.log("Invitation validity period missing, use --hours [hours]"); }
            else { ok = true; }
            break;
        }
        case 'runcommand': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing device id, use --id '[deviceid]'")); }
            else if (args.run == null) { console.log("Missing run, use --run \"command\""); }
            else { ok = true; }
            break;
        }
        case 'shell': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing device id, use --id '[deviceid]'")); }
            else { ok = true; }
            break;
        }
        case 'upload': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing device id, use --id '[deviceid]'")); }
            else if (args.file == null) { console.log("Local file missing, use --file [file] specify the file to upload"); }
            else if (args.target == null) { console.log("Remote target path missing, use --target [path] to specify the remote location"); }
            else if (require('fs').existsSync(args.file) == false) { console.log("Local file does not exists, check --file"); }
            else { ok = true; }
            break;
        }
        case 'download': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing device id, use --id '[deviceid]'")); }
            else if (args.file == null) { console.log("Remote file missing, use --file [file] specify the remote file to download"); }
            else if (args.target == null) { console.log("Target path missing, use --target [path] to specify the local download location"); }
            else { ok = true; }
            break;
        }
        case 'deviceopenurl': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing device id, use --id '[deviceid]'")); }
            else if (args.openurl == null) { console.log("Remote URL, use --openurl [url] specify the link to open."); }
            else { ok = true; }
            break;
        }
        case 'devicemessage': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing device id, use --id '[deviceid]'")); }
            else if (args.msg == null) { console.log("Remote message, use --msg \"[message]\" specify a remote message."); }
            else { ok = true; }
            break;
        }
        case 'devicetoast': {
            if (args.id == null) { console.log(winRemoveSingleQuotes("Missing device id, use --id '[deviceid]'")); }
            else if (args.msg == null) { console.log("Remote message, use --msg \"[message]\" specify a remote message."); }
            else { ok = true; }
            break;
        }
        case 'help': {
            if (args['_'].length < 2) {
                console.log("Get help on an action. Type:\r\n\r\n  help [action]\r\n\r\nPossible actions are: " + possibleCommands.join(', ') + '.');
            } else {
                switch (args['_'][1].toLowerCase()) {
                    case 'config': {
                        displayConfigHelp();
                        break;
                    }
                    case 'sendinviteemail': {
                        console.log("Send invitation email with instructions on how to install the mesh agent for a specific device group. Example usage:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl SendInviteEmail --id 'groupid' --message \"msg\" --email user@sample.com"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl SendInviteEmail --group \"My Computers\" --name \"Jack\" --email user@sample.com"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Device group identifier (or --group).");
                        } else {
                            console.log("  --id '[groupid]'       - Device group identifier (or --group).");
                        }
                        console.log("  --group [groupname]    - Device group name (or --id).");
                        console.log("  --email [email]        - Email address.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --name (name)          - Name of recipient to be included in the email.");
						console.log("  --message (msg)        - Message to be included in the email.");
                        break;
                    }
                    case 'generateinvitelink': {
                        console.log("Generate a agent invitation URL for a given group. Example usage:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl GenerateInviteLink --id 'groupid' --hours 24"));
                        console.log("  MeshCtrl GenerateInviteLink --group \"My Computers\" --hours 0");
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Device group identifier (or --group).");
                        } else {
                            console.log("  --id '[groupid]'       - Device group identifier (or --group).");
                        }
                        console.log("  --group [groupname]    - Device group name (or --id).");
                        console.log("  --hours [hours]        - Validity period in hours or 0 for infinit.");
                        break;
                    }
                    case 'showevents': {
                        console.log("Show the server's event stream for this user account. Example usage:\r\n");
                        console.log("  MeshCtrl ShowEvents");
                        console.log("  MeshCtrl ShowEvents --filter nodeconnect");
                        console.log("  MeshCtrl ShowEvents --filter uicustomevent,changenode");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --filter [actions]    - Show only specified actions.");
                        break;
                    }
                    case 'serverinfo': {
                        console.log("Get information on the MeshCentral server, Example usages:\r\n");
                        console.log("  MeshCtrl ServerInfo --loginuser myaccountname --loginpass mypassword");
                        console.log("  MeshCtrl ServerInfo --loginuser myaccountname --loginkeyfile key.txt");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --json                 - Show result as JSON.");
                        break;
                    }
                    case 'userinfo': {
                        console.log("Get account information for the login account, Example usages:\r\n");
                        console.log("  MeshCtrl UserInfo --loginuser myaccountname --loginpass mypassword");
                        console.log("  MeshCtrl UserInfo --loginuser myaccountname --loginkeyfile key.txt");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --json                 - Show result as JSON.");
                        break;
                    }
                    case 'listusers': {
                        console.log("List the account on the MeshCentral server, Example usages:\r\n");
                        console.log("  MeshCtrl ListUsers");
                        console.log("  MeshCtrl ListUsers --json");
                        console.log("  MeshCtrl ListUsers --nameexists \"bob\"");
                        console.log("  MeshCtrl ListUsers --filter 2fa");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --idexists [id]        - Return 1 if id exists, 0 if not.");
                        console.log("  --nameexists [name]    - Return id if name exists.");
                        console.log("  --filter [filter1,...] - Filter user names: 2FA, NO2FA.");
                        console.log("  --json                 - Show result as JSON.");
                        break;
                    }
                    case 'listusersessions': {
                        console.log("List active user sessions on the MeshCentral server, Example usages:\r\n");
                        console.log("  MeshCtrl ListUserSessions");
                        console.log("  MeshCtrl ListUserSessions --json");
                        break;
                    }
                    case 'listusergroups': {
                        console.log("List user groups on the MeshCentral server, Example usages:\r\n");
                        console.log("  MeshCtrl ListUserGroups");
                        console.log("  MeshCtrl ListUserGroups --json");
                        break;
                    }
                    case 'listdevicegroups': {
                        console.log("List the device groups for this account, Example usages:\r\n");
                        console.log("  MeshCtrl ListDeviceGroups ");
                        console.log("  MeshCtrl ListDeviceGroups --json");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --idexists [id]        - Return 1 if id exists, 0 if not.");
                        console.log("  --nameexists [name]    - Return id if name exists.");
                        console.log("  --emailexists [email]  - Return id if email exists.");
                        console.log("  --hex                  - Display meshid in hex format.");
                        console.log("  --json                 - Show result as JSON.");
                        break;
                    }
                    case 'listdevices': {
                        console.log("List devices, Example usages:\r\n");
                        console.log("  MeshCtrl ListDevices");
                        console.log(winRemoveSingleQuotes("  MeshCtrl ListDevices -id '[groupid]' --json"));
                        console.log("\r\nOptional arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Filter by group identifier (or --group).");
                        } else {
                            console.log("  --id '[groupid]'       - Filter by group identifier (or --group).");
                        }
                        console.log("  --group [groupname]    - Filter by group name (or --id).");
                        console.log("  --count                - Only return the device count.");
                        console.log("  --json                 - Show result as JSON.");
                        console.log("  --csv                  - Show result as comma seperated values.");
                        break;
                    }
                    case 'listusersofdevicegroup': {
                        console.log("List users that have permissions for a given device group, Example usage:\r\n");
                        console.log("  MeshCtrl ListUserOfDeviceGroup ");
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Device group identifier.");
                        } else {
                            console.log("  --id '[groupid]'       - Device group identifier.");
                        }
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --json                 - Show result as JSON.");
                        break;
                    }
                    case 'adduser': {
                        console.log("Add a new user account, Example usages:\r\n");
                        console.log("  MeshCtrl AddUser --user newaccountname --pass newpassword");
                        console.log("\r\nRequired arguments:\r\n");
                        console.log("  --user [name]          - New account name.");
                        console.log("  --pass [password]      - New account password.");
                        console.log("  --randompass           - Create account with a random password.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --email [email]        - New account email address.");
                        console.log("  --emailverified        - New account email is verified.");
                        console.log("  --resetpass            - Request password reset on next login.");
                        console.log("  --siteadmin            - Create the account as full site administrator.");
                        console.log("  --manageusers          - Allow this account to manage server users.");
                        console.log("  --fileaccess           - Allow this account to store server files.");
                        console.log("  --serverupdate         - Allow this account to update the server.");
                        console.log("  --locked               - This account will be locked.");
                        console.log("  --nonewgroups          - Account will not be allowed to create device groups.");
                        console.log("  --notools              - Account not see MeshCMD download links.");
                        console.log("  --domain [domain]      - Account domain, only for cross-domain admins.");
                        break;
                    }
                    case 'removeuser': {
                        console.log("Delete a user account, Example usages:\r\n");
                        console.log("  MeshCtrl RemoveUser --userid accountid");
                        console.log("\r\nRequired arguments:\r\n");
                        console.log("  --userid [id]          - Account identifier.");
                        break;
                    }
                    case 'addusergroup': {
                        console.log("Create a new user group, Example usages:\r\n");
                        console.log("  MeshCtrl AddUserGroup --name \"Test Group\"");
                        console.log("\r\nRequired arguments:\r\n");
                        console.log("  --name [name]          - Name of the user group.");
                        break;
                    }
                    case 'removeusergroup': {
                        console.log("Remove a user group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl RemoveUserGroup --groupid 'ugrp//abcdf'"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --groupid [groupid]   - User group identifier.");
                        } else {
                            console.log("  --groupid '[groupid]' - User group identifier.");
                        }
                        break;
                    }
                    case 'addtousergroup': {
                        console.log("Add a user, device or device group to a user group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl AddToUserGroup --id 'user//abcdef' --groupid 'ugrp//abcdf'"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl AddToUserGroup --id 'node//abcdef' --groupid 'ugrp//abcdf' --rights [rights]"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl AddToUserGroup --id 'mesh//abcdef' --groupid 'ugrp//abcdf' --rights [rights]"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [id]             - Identifier to add.");
                            console.log("  --groupid [groupid]   - User group identifier.");
                        } else {
                            console.log("  --id '[id]'           - Identifier to add.");
                            console.log("  --groupid '[groupid]' - User group identifier.");
                        }
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --rights [number]     - Rights granted for adding device or device group.");
                        console.log("                        - 4294967295 for full admin or the sum of the following numbers.");
                        console.log("          1 = Edit Device Group                2 = Manage Users           ");
                        console.log("          4 = Manage Computers                 8 = Remote Control         ");
                        console.log("         16 = Agent Console                   32 = Server Files           ");
                        console.log("         64 = Wake Device                    128 = Set Notes              ");
                        console.log("        256 = Remote View Only               512 = No Terminal            ");
                        console.log("       1024 = No Files                      2048 = No Intel AMT           ");
                        console.log("       4096 = Desktop Limited Input         8192 = Limit Events           ");
                        console.log("      16384 = Chat / Notify                32768 = Uninstall Agent        ");
                        console.log("      65536 = No Remote Desktop           131072 = Remote Commands        ");
                        console.log("     262144 = Reset / Power off      ");
                        break;
                    }
                    case 'removefromusergroup': {
                        console.log("Remove a user, device or device group from a user group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl RemoveUserFromUserGroup --userid 'user//abcdef' --groupid 'ugrp//abcdf'"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl RemoveUserFromUserGroup --userid 'node//abcdef' --groupid 'ugrp//abcdf'"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl RemoveUserFromUserGroup --userid 'mesh//abcdef' --groupid 'ugrp//abcdf'"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [userid]         - Identifier to remove.");
                            console.log("  --groupid [groupid]   - User group identifier.");
                        } else {
                            console.log("  --id '[userid]'       - Identifier to remove.");
                            console.log("  --groupid '[groupid]' - User group identifier.");
                        }
                        break;
                    }
                    case 'removeallusersfromusergroup': {
                        console.log("Remove all users from a user group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl RemoveAllUsersFromUserGroup --groupid 'ugrp//abcdf'"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --groupid [groupid]   - User group identifier.");
                        } else {
                            console.log("  --groupid '[groupid]' - User group identifier.");
                        }
                        break;
                    }
                    case 'adddevicegroup': {
                        console.log("Add a device group, Example usages:\r\n");
                        console.log("  MeshCtrl AddDeviceGroup --name newgroupname");
                        console.log("  MeshCtrl AddDeviceGroup --name newgroupname --desc description --amtonly");
                        console.log("  MeshCtrl AddDeviceGroup --name newgroupname --features 1 --consent 7");
                        console.log("\r\nRequired arguments:\r\n");
                        console.log("  --name [name]          - Name of the new group.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --desc [description]   - New group description.");
                        console.log("  --amtonly              - New group is agent-less, Intel AMT only.");
                        console.log("  --features [number]    - Set device group features, sum of numbers below.");
                        console.log("     1 = Auto-Remove                 2 = Hostname Sync");
                        console.log("     4 = Record Sessions");
                        console.log("  --consent [number]     - Set device group user consent, sum of numbers below.");
                        console.log("     1 = Desktop notify user         2 = Terminal notify user   ");
                        console.log("     4 = Files notify user           8 = Desktop prompt user    ");
                        console.log("    16 = Terminal prompt user       32 = Files prompt user      ");
                        console.log("    64 = Desktop Toolbar        ");
                        break;
                    }
                    case 'removedevicegroup': {
                        console.log("Remove a device group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl RemoveDeviceGroup --id 'groupid'"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Device group identifier (or --group).");
                        } else {
                            console.log("  --id '[groupid]'       - Device group identifier (or --group).");
                        }
                        console.log("  --group [groupname]    - Device group name (or --id).");
                        break;
                    }
                    case 'editdevicegroup': {
                        console.log("Edit a device group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl EditDeviceGroup --id 'groupid' --name \"New Name\""));
                        console.log(winRemoveSingleQuotes("  MeshCtrl EditDeviceGroup --id 'groupid' --desc \"Description\" --consent 63"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl EditDeviceGroup --id 'groupid' --invitecodes \"code1,code2\" --backgroundonly"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Device group identifier (or --group).");
                        } else {
                            console.log("  --id '[groupid]'       - Device group identifier (or --group).");
                        }
                        console.log("  --group [groupname]    - Device group name (or --id).");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --name [name]          - Set new device group name.");
                        console.log("  --desc [description]   - Set new device group description, blank to clear.");
                        console.log("  --flags [number]       - Set device group flags, sum of the values below, 0 for none.");
                        console.log("     1 = Auto remove device on disconnect.");
                        console.log("     2 = Sync hostname.");
                        console.log("  --consent [number]     - Set device group consent options, sum of the values below, 0 for none.");
                        console.log("     1 = Desktop notify user.");
                        console.log("     2 = Terminal notify user.");
                        console.log("     4 = Files notify user.");
                        console.log("     8 = Desktop prompt for user consent.");
                        console.log("    16 = Terminal prompt for user consent.");
                        console.log("    32 = Files prompt for user consent.");
                        console.log("    64 = Desktop show connection toolbar.");
                        console.log("  --invitecodes [aa,bb]  - Comma seperated list of invite codes, blank to clear.");
                        console.log("    --backgroundonly     - When used with invitecodes, set agent to only install in background.");
                        console.log("    --interactiveonly    - When used with invitecodes, set agent to only run on demand.");
                        break;
                    }
                    case 'movetodevicegroup': {
                        console.log("Move a device to a new device group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl MoveToDeviceGroup --devid 'deviceid' --id 'groupid'"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Device group identifier (or --group).");
                        } else {
                            console.log("  --id '[groupid]'       - Device group identifier (or --group).");
                        }
                        console.log("  --group [groupname]    - Device group name (or --id).");
                        if (process.platform == 'win32') {
                            console.log("  --devid [deviceid]     - Device identifier.");
                        } else {
                            console.log("  --devid '[deviceid]'   - Device identifier.");
                        }
                        break;
                    }
                    case 'addusertodevicegroup': {
                        console.log("Add a user to a device group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl AddUserToDeviceGroup --id 'groupid' --userid userid --fullrights"));
                        console.log("  MeshCtrl AddUserToDeviceGroup --group groupname --userid userid --editgroup --manageusers");
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Device group identifier (or --group).");
                        } else {
                            console.log("  --id '[groupid]'       - Device group identifier (or --group).");
                        }
                        console.log("  --group [groupname]    - Device group name (or --id).");
                        console.log("  --userid [userid]      - The user identifier.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --fullrights           - Allow full rights over this device group.");
                        console.log("  --editgroup            - Allow the user to edit group information.");
                        console.log("  --manageusers          - Allow the user to add/remove users.");
                        console.log("  --managedevices        - Allow the user to edit device information.");
                        console.log("  --remotecontrol        - Allow device remote control operations.");
                        console.log("  --agentconsole         - Allow agent console operations.");
                        console.log("  --serverfiles          - Allow access to group server files.");
                        console.log("  --wakedevices          - Allow device wake operation.");
                        console.log("  --notes                - Allow editing of device notes.");
                        console.log("  --desktopviewonly      - Restrict user to view-only remote desktop.");
                        console.log("  --limiteddesktop       - Limit remote desktop keys.");
                        console.log("  --noterminal           - Hide the terminal tab from this user.");
                        console.log("  --nofiles              - Hide the files tab from this user.");
                        console.log("  --noamt                - Hide the Intel AMT tab from this user.");
                        console.log("  --limitedevents        - User can only see his own events.");
                        console.log("  --chatnotify           - Allow chat and notification options.");
                        console.log("  --uninstall            - Allow remote uninstall of the agent.");
                        if (args.limiteddesktop) { meshrights |= 4096; }
                        if (args.limitedevents) { meshrights |= 8192; }
                        if (args.chatnotify) { meshrights |= 16384; }
                        if (args.uninstall) { meshrights |= 32768; }

                        break;
                    }
                    case 'removeuserfromdevicegroup': {
                        console.log("Remove a user from a device group, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl RemoveuserFromDeviceGroup --id 'groupid' --userid userid"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [groupid]         - Device group identifier (or --group).");
                        } else {
                            console.log("  --id '[groupid]'       - Device group identifier (or --group).");
                        }
                        console.log("  --group [groupname]    - Device group name (or --id).");
                        console.log("  --userid [userid]      - The user identifier.");
                        break;
                    }
                    case 'addusertodevice': {
                        console.log("Add a user to a device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl AddUserToDevice --id 'deviceid' --userid userid --fullrights"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl AddUserToDevice --id 'deviceid' --userid userid --remotecontrol"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("  --userid [userid]      - The user identifier.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --fullrights           - Allow full rights over this device.");
                        console.log("  --remotecontrol        - Allow device remote control operations.");
                        console.log("  --agentconsole         - Allow agent console operations.");
                        console.log("  --serverfiles          - Allow access to group server files.");
                        console.log("  --wakedevices          - Allow device wake operation.");
                        console.log("  --notes                - Allow editing of device notes.");
                        console.log("  --desktopviewonly      - Restrict user to view-only remote desktop.");
                        console.log("  --limiteddesktop       - Limit remote desktop keys.");
                        console.log("  --noterminal           - Hide the terminal tab from this user.");
                        console.log("  --nofiles              - Hide the files tab from this user.");
                        console.log("  --noamt                - Hide the Intel AMT tab from this user.");
                        console.log("  --limitedevents        - User can only see his own events.");
                        console.log("  --chatnotify           - Allow chat and notification options.");
                        console.log("  --uninstall            - Allow remote uninstall of the agent.");
                        break;
                    }
                    case 'removeuserfromdevice': {
                        console.log("Remove a user from a device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl RemoveuserFromDeviceGroup --id 'deviceid' --userid userid"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("  --userid [userid]      - The user identifier.");
                        break;
                    }
                    case 'broadcast': {
                        console.log("Display a message to one or all logged in users, Example usages:\r\n");
                        console.log("  MeshCtrl Broadcast --msg \"This is a test\"");
                        console.log("\r\nRequired arguments:\r\n");
                        console.log("  --msg [message]        - Message to display.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --user [userid]        - Send the message to the speficied user.");
                        break;
                    }
                    case 'deviceinfo': {
                        console.log("Display information about a device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl DeviceInfo --id 'deviceid'"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl DeviceInfo --id 'deviceid' --json"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --raw                  - Output raw data in JSON format.");
                        console.log("  --json                 - Give results in JSON format.");
                        break;
                    }
                    case 'runcommand': {
                        console.log("Run a shell command on a remote device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl RunCommand --id 'deviceid' --run \"command\""));
                        console.log(winRemoveSingleQuotes("  MeshCtrl RunCommand --id 'deviceid' --run \"command\" --powershell"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("  --run \"[command]\"    - Shell command to execute on the remote device.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --powershell           - Run in Windows PowerShell.");
                        console.log("  --runasuser            - Attempt to run the command as logged in user.");
                        console.log("  --runasuseronly        - Only run the command as the logged in user.");
                        break;
                    }
                    case 'shell': {
                        console.log("Access a command shell on a remote device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl Shell --id 'deviceid'"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl Shell --id 'deviceid' --powershell"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --powershell           - Run a Windows PowerShell.");
                        break;
                    }
                    case 'upload': {
                        console.log("Upload a local file to a remote device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl Upload --id 'deviceid' --file sample.txt --target c:\\"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl Upload --id 'deviceid' --file sample.txt --target /tmp"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("  --file [localfile]     - The local file to upload.");
                        console.log("  --target [remotepath]  - The remote path to upload the file to.");
                        break;
                    }
                    case 'download': {
                        console.log("Download a file from a remote device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl Download --id 'deviceid' --file C:\\sample.txt --target c:\\temp"));
                        console.log(winRemoveSingleQuotes("  MeshCtrl Download --id 'deviceid' --file /tmp/sample.txt --target /tmp"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("  --file [remotefile]    - The remote file to download.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --target [localpath]   - The local path to download the file to.");
                        break;
                    }
                    case 'deviceopenurl': {
                        console.log("Open a web page on a remote device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl DeviceOpenUrl --id 'deviceid' --openurl http://meshcentral.com"));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("  --openurl [url]        - Link to the web page.");
                        break;
                    }
                    case 'devicemessage': {
                        console.log("Display a message on the remote device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl DeviceMessage --id 'deviceid' --msg \"message\""));
                        console.log(winRemoveSingleQuotes("  MeshCtrl DeviceMessage --id 'deviceid' --msg \"message\" --title \"title\""));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("  --msg [message]        - The message to display.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --title [title]        - Messagebox title, default is \"MeshCentral\".");
                        break;
                    }
                    case 'devicetoast': {
                        console.log("Display a toast message on the remote device, Example usages:\r\n");
                        console.log(winRemoveSingleQuotes("  MeshCtrl DeviceToast --id 'deviceid' --msg \"message\""));
                        console.log(winRemoveSingleQuotes("  MeshCtrl DeviceToast --id 'deviceid' --msg \"message\" --title \"title\""));
                        console.log("\r\nRequired arguments:\r\n");
                        if (process.platform == 'win32') {
                            console.log("  --id [deviceid]        - The device identifier.");
                        } else {
                            console.log("  --id '[deviceid]'      - The device identifier.");
                        }
                        console.log("  --msg [message]        - The message to display.");
                        console.log("\r\nOptional arguments:\r\n");
                        console.log("  --title [title]        - Toast title, default is \"MeshCentral\".");
                        break;
                    }
                    default: {
                        console.log("Get help on an action. Type:\r\n\r\n  help [action]\r\n\r\nPossible actions are: " + possibleCommands.join(', ') + '.');
                    }
                }
            }
            break;
        }
    }

    if (ok) { serverConnect(); }
}

function displayConfigHelp() {
    console.log("Perform operations on the config.json file. Example usage:\r\n");
    console.log("  MeshCtrl config --show");
    console.log("\r\nOptional arguments:\r\n");
    console.log("  --show                        - Display the config.json file.");
    console.log("  --listdomains                 - Display non-default domains.");
    console.log("  --adddomain [domain]          - Add a domain.");
    console.log("  --removedomain [domain]       - Remove a domain.");
    console.log("  --settodomain [domain]        - Set values to the domain.");
    console.log("  --removefromdomain [domain]   - Remove values from the domain.");
    console.log("\r\nWith adddomain, removedomain, settodomain and removefromdomain you can add the key and value pair. For example:\r\n");
    console.log("  --adddomain \"MyDomain\" --title \"My Server Name\" --newAccounts false");
    console.log("  --settodomain \"MyDomain\" --title \"My Server Name\"");
    console.log("  --removefromdomain \"MyDomain\" --title");
}

function performConfigOperations(args) {
    var domainValues = ['title', 'title2', 'titlepicture', 'trustedcert', 'welcomepicture', 'welcometext', 'userquota', 'meshquota', 'newaccounts', 'usernameisemail', 'newaccountemaildomains', 'newaccountspass', 'newaccountsrights', 'geolocation', 'lockagentdownload', 'userconsentflags', 'Usersessionidletimeout', 'auth', 'ldapoptions', 'ldapusername', 'ldapuserbinarykey', 'ldapuseremail', 'footer', 'certurl', 'loginKey', 'userallowedip', 'agentallowedip', 'agentnoproxy', 'agentconfig', 'orphanagentuser', 'httpheaders', 'yubikey', 'passwordrequirements', 'limits', 'amtacmactivation', 'redirects', 'sessionrecording', 'hide', 'loginkey'];
    var domainObjectValues = [ 'ldapoptions', 'httpheaders', 'yubikey', 'passwordrequirements', 'limits', 'amtacmactivation', 'redirects', 'sessionrecording' ];
    var domainArrayValues = [ 'newaccountemaildomains', 'newaccountsrights', 'loginkey', 'agentconfig' ];
    var configChange = false;
    var fs = require('fs');
    var path = require('path');
    var configFile = 'config.json';
    var didSomething = 0;
    if (fs.existsSync(configFile) == false) { configFile = path.join('meshcentral-data', 'config.json'); }
    if (fs.existsSync(configFile) == false) { configFile = path.join(__dirname, 'config.json'); }
    if (fs.existsSync(configFile) == false) { configFile = path.join(__dirname, 'meshcentral-data', 'config.json'); }
    if (fs.existsSync(configFile) == false) { configFile = path.join(__dirname, '..', 'meshcentral-data', 'config.json'); }
    if (fs.existsSync(configFile) == false) { configFile = path.join(__dirname, '..', '..', 'meshcentral-data', 'config.json'); }
    if (fs.existsSync(configFile) == false) { console.log("Unable to find config.json."); return; }
    var config = null;
    try { config = fs.readFileSync(configFile).toString('utf8'); } catch (ex) { console.log("Error: Unable to read config.json"); return; }
    try { config = require(configFile); } catch (e) { console.log('ERROR: Unable to parse ' + configFilePath + '.'); return null; }
    if (args.adddomain != null) {
        didSomething++;
        if (config.domains == null) { config.domains = {}; }
        if (config.domains[args.adddomain] != null) { console.log("Error: Domain \"" + args.adddomain + "\" already exists"); }
        else {
            configChange = true;
            config.domains[args.adddomain] = {};
            for (var i in args) {
                if (domainValues.indexOf(i.toLowerCase()) >= 0) {
                    if (args[i] == 'true') { args[i] = true; } else if (args[i] == 'false') { args[i] = false; } else if (parseInt(args[i]) == args[i]) { args[i] = parseInt(args[i]); }
                    config.domains[args.adddomain][i] = args[i];
                    configChange = true;
                }
            }
        }
    }
    if (args.removedomain != null) {
        didSomething++;
        if (config.domains == null) { config.domains = {}; }
        if (config.domains[args.removedomain] == null) { console.log("Error: Domain \"" + args.removedomain + "\" does not exist"); }
        else { delete config.domains[args.removedomain]; configChange = true; }
    }
    if (args.settodomain != null) {
        didSomething++;
        if (config.domains == null) { config.domains = {}; }
        if (args.settodomain == true) { args.settodomain = ''; }
        if (config.domains[args.settodomain] == null) { console.log("Error: Domain \"" + args.settodomain + "\" does not exist"); }
        else {
            for (var i in args) {
                if ((i == '_') || (i == 'settodomain')) continue;
                if (domainValues.indexOf(i.toLowerCase()) >= 0) {
                    var isObj = (domainObjectValues.indexOf(i.toLowerCase()) >= 0);
                    var isArr = (domainArrayValues.indexOf(i.toLowerCase()) >= 0);
                    if ((isObj == false) && (isArr == false)) {
                        // Simple value set
                        if (args[i] == '') { delete config.domains[args.settodomain][i]; configChange = true; } else {
                            if (args[i] == 'true') { args[i] = true; } else if (args[i] == 'false') { args[i] = false; } else if (parseInt(args[i]) == args[i]) { args[i] = parseInt(args[i]); }
                            config.domains[args.settodomain][i] = args[i];
                            configChange = true;
                        }
                    } else if (isObj || isArr) {
                        // Set an object/array value
                        if (args[i] == '') { delete config.domains[args.settodomain][i]; configChange = true; } else {
                            var x = null;
                            try { x = JSON.parse(args[i]); } catch (ex) { }
                            if ((x == null) || (typeof x != 'object')) { console.log("Unable to parse JSON for " + i + "."); } else {
                                if (isArr && Array.isArray(x) == false) {
                                    console.log("Value " + i + " must be an array.");
                                } else if (!isArr && Array.isArray(x) == true) {
                                    console.log("Value " + i + " must be an object.");
                                } else {
                                    config.domains[args.settodomain][i] = x;
                                    configChange = true;
                                }
                            }
                        }
                    }
                } else {
                    console.log('Invalid configuration value: ' + i);
                }
            }
        }
    }
    if (args.removefromdomain != null) {
        didSomething++;
        if (config.domains == null) { config.domains = {}; }
        if (config.domains[args.removefromdomain] == null) { console.log("Error: Domain \"" + args.removefromdomain + "\" does not exist"); }
        else { for (var i in args) { if (domainValues.indexOf(i.toLowerCase()) >= 0) { delete config.domains[args.removefromdomain][i]; configChange = true; } } }
    }
    if (configChange) {
        try { fs.writeFileSync(configFile, JSON.stringify(config, null, 2)); } catch (ex) { console.log("Error: Unable to read config.json"); return; }
    }
    if (args.show == 1) {
        console.log(JSON.stringify(config, null, 2)); return;
    } else if (args.listdomains == 1) {
        if (config.domains == null) {
            console.log('No domains found.'); return;
        } else {
            // Show the list of active domains, skip the default one.
            for (var i in config.domains) { if ((i != '') && (i[0] != '_')) { console.log(i); } } return;
        }
    } else {
        if (didSomething == 0) {
            displayConfigHelp();
        } else {
            console.log("Done.");
        }
    }
}

function onVerifyServer(clientName, certs) { return null; }

function serverConnect() {
    const WebSocket = require('ws');

    var url = 'wss://localhost/control.ashx';
    if (args.url) {
        url = args.url;
        if (url.length < 5) { console.log("Invalid url."); process.exit(); return; }
        if ((url.startsWith('wss://') == false) && (url.startsWith('ws://') == false)) { console.log("Invalid url."); process.exit(); return; }
        var i = url.indexOf('?key='), loginKey = null;
        if (i >= 0) { loginKey = url.substring(i + 5); url = url.substring(0, i); }
        if (url.endsWith('/') == false) { url += '/'; }
        url += 'control.ashx';
        if (loginKey != null) { url += '?key=' + loginKey; }
    }

    // TODO: checkServerIdentity does not work???
    var options = { rejectUnauthorized: false, checkServerIdentity: onVerifyServer }

    // Setup the HTTP proxy if needed
    if (args.proxy != null) {
        const HttpsProxyAgent = require('https-proxy-agent');
        options.agent = new HttpsProxyAgent(require('url').parse(args.proxy));
    }

    // Password authentication
    if (args.loginpass != null) {
        var username = 'admin';
        if (args.loginuser != null) { username = args.loginuser; }
        var token = '';
        if (args.token != null) { token = ',' + Buffer.from('' + args.token).toString('base64'); }
        options.headers = { 'x-meshauth': Buffer.from(username).toString('base64') + ',' + Buffer.from(args.loginpass).toString('base64') + token }
    }

    // Cookie authentication
    var ckey = null;
    if (args.loginkey != null) {
        // User key passed in a argument hex
        if (args.loginkey.length != 160) { console.log("Invalid login key."); process.exit(); return; }
        ckey = Buffer.from(args.loginkey, 'hex');
        if (ckey != 80) { console.log("Invalid login key."); process.exit(); return; }
    } else if (args.loginkeyfile != null) {
        // Load key from hex file
        var fs = require('fs');
        try {
            var keydata = fs.readFileSync(args.loginkeyfile, 'utf8').split(' ').join('').split('\r').join('').split('\n').join('');
            ckey = Buffer.from(keydata, 'hex');
            if (ckey.length != 80) { console.log("Invalid login key file."); process.exit(); return; }
        } catch (ex) { console.log(ex.message); process.exit(); return; }
    }

    if (ckey != null) {
        var domainid = '', username = 'admin';
        if (args.logindomain != null) { domainid = args.logindomain; }
        if (args.loginuser != null) { username = args.loginuser; }
        url += '?auth=' + encodeCookie({ userid: 'user/' + domainid + '/' + username, domainid: domainid }, ckey);
    } else {
        if (args.logindomain != null) { console.log("--logindomain can only be used along with --loginkey."); process.exit(); return; }
    }

    const ws = new WebSocket(url, options);
    //console.log('Connecting to ' + url);

    ws.on('open', function open() {
        //console.log('Connected.');
        switch (settings.cmd) {
            case 'serverinfo': { break; }
            case 'userinfo': { break; }
            case 'listusers': { ws.send(JSON.stringify({ action: 'users', responseid: 'meshctrl' })); break; }
            case 'listusersessions': { ws.send(JSON.stringify({ action: 'wssessioncount', responseid: 'meshctrl' })); break; }
            case 'removeallusersfromusergroup':
            case 'listusergroups': { ws.send(JSON.stringify({ action: 'usergroups', responseid: 'meshctrl' })); break; }
            case 'listdevicegroups': { ws.send(JSON.stringify({ action: 'meshes', responseid: 'meshctrl' })); break; }
            case 'listusersofdevicegroup': { ws.send(JSON.stringify({ action: 'meshes', responseid: 'meshctrl' })); break; }
            case 'listdevices': {
                if (args.group) {
                    ws.send(JSON.stringify({ action: 'nodes', meshname: args.group, responseid: 'meshctrl' }));
                } else if (args.id) {
                    ws.send(JSON.stringify({ action: 'nodes', meshid: args.id, responseid: 'meshctrl' }));
                } else {
                    ws.send(JSON.stringify({ action: 'meshes' }));
                    ws.send(JSON.stringify({ action: 'nodes', responseid: 'meshctrl' }));
                }
                break;
            }
            case 'adduser': {
                var siteadmin = 0;
                if (args.siteadmin) { siteadmin = 0xFFFFFFFF; }
                if (args.manageusers) { siteadmin |= 2; }
                if (args.fileaccess) { siteadmin |= 8; }
                if (args.serverupdate) { siteadmin |= 16; }
                if (args.locked) { siteadmin |= 32; }
                if (args.nonewgroups) { siteadmin |= 64; }
                if (args.notools) { siteadmin |= 128; }
                if (args.randompass) { args.pass = getRandomAmtPassword(); }
                var op = { action: 'adduser', username: args.user, pass: args.pass, responseid: 'meshctrl' };
                if (args.email) { op.email = args.email; if (args.emailverified) { op.emailVerified = true; } }
                if (args.resetpass) { op.resetNextLogin = true; }
                if (siteadmin != 0) { op.siteadmin = siteadmin; }
                if (args.domain) { op.domain = args.domain; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'removeuser': {
                var userid = args.userid;
                if ((args.domain != null) && (userid.indexOf('/') < 0)) { userid = 'user/' + args.domain + '/' + userid; }
                ws.send(JSON.stringify({ action: 'deleteuser', userid: userid, responseid: 'meshctrl' }));
                break;
            }
            case 'addusergroup': {
                var op = { action: 'createusergroup', name: args.name, desc: args.desc, responseid: 'meshctrl' };
                if (args.domain) { op.domain = args.domain; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'removeusergroup': {
                var ugrpid = args.groupid;
                if ((args.domain != null) && (userid.indexOf('/') < 0)) { ugrpid = 'ugrp/' + args.domain + '/' + ugrpid; }
                ws.send(JSON.stringify({ action: 'deleteusergroup', ugrpid: ugrpid, responseid: 'meshctrl' }));
                break;
            }
            case 'addtousergroup': {
                var ugrpid = args.groupid;
                if ((args.domain != null) && (userid.indexOf('/') < 0)) { ugrpid = 'ugrp/' + args.domain + '/' + ugrpid; }

                // Add a user to a user group
                if (args.userid != null) {
                    var userid = args.userid;
                    if ((args.domain != null) && (userid.indexOf('/') < 0)) { userid = 'user/' + args.domain + '/' + userid; }
                    ws.send(JSON.stringify({ action: 'addusertousergroup', ugrpid: ugrpid, usernames: [userid.split('/')[2]], responseid: 'meshctrl' }));
                    break;
                }

                if ((args.id != null) && (args.id.startsWith('user/'))) {
                    ws.send(JSON.stringify({ action: 'addusertousergroup', ugrpid: ugrpid, usernames: [args.id.split('/')[2]], responseid: 'meshctrl' }));
                    break;
                }

                var rights = 0;
                if (args.rights != null) { rights = parseInt(args.rights); }

                // Add a device group to a user group
                if (args.meshid != null) {
                    var meshid = args.meshid;
                    if ((args.domain != null) && (userid.indexOf('/') < 0)) { meshid = 'mesh/' + args.domain + '/' + meshid; }
                    ws.send(JSON.stringify({ action: 'addmeshuser', meshid: meshid, userid: ugrpid, meshadmin: rights, responseid: 'meshctrl' }));
                    break;
                }

                if ((args.id != null) && (args.id.startsWith('mesh/'))) {
                    ws.send(JSON.stringify({ action: 'addmeshuser', meshid: args.id, userid: ugrpid, meshadmin: rights, responseid: 'meshctrl' }));
                    break;
                }

                // Add a device to a user group
                if (args.nodeid != null) {
                    var nodeid = args.nodeid;
                    if ((args.domain != null) && (userid.indexOf('/') < 0)) { nodeid = 'node/' + args.domain + '/' + nodeid; }
                    ws.send(JSON.stringify({ action: 'adddeviceuser', nodeid: nodeid, userids: [ugrpid], rights: rights, responseid: 'meshctrl' }));
                    break;
                }

                if ((args.id != null) && (args.id.startsWith('node/'))) {
                    ws.send(JSON.stringify({ action: 'adddeviceuser', nodeid: args.id, userids: [ugrpid], rights: rights, responseid: 'meshctrl' }));
                    break;
                }

                break;
            }
            case 'removefromusergroup': {
                var ugrpid = args.groupid;
                if ((args.domain != null) && (userid.indexOf('/') < 0)) { ugrpid = 'ugrp/' + args.domain + '/' + ugrpid; }

                // Remove a user from a user group
                if (args.userid != null) {
                    var userid = args.userid;
                    if ((args.domain != null) && (userid.indexOf('/') < 0)) { userid = 'user/' + args.domain + '/' + userid; }
                    ws.send(JSON.stringify({ action: 'removeuserfromusergroup', ugrpid: ugrpid, userid: userid, responseid: 'meshctrl' }));
                    break;
                }

                if ((args.id != null) && (args.id.startsWith('user/'))) {
                    ws.send(JSON.stringify({ action: 'removeuserfromusergroup', ugrpid: ugrpid, userid: args.id, responseid: 'meshctrl' }));
                    break;
                }

                // Remove a device group from a user group
                if (args.meshid != null) {
                    var meshid = args.meshid;
                    if ((args.domain != null) && (userid.indexOf('/') < 0)) { meshid = 'mesh/' + args.domain + '/' + meshid; }
                    ws.send(JSON.stringify({ action: 'removemeshuser', meshid: meshid, userid: ugrpid, responseid: 'meshctrl' }));
                    break;
                }

                if ((args.id != null) && (args.id.startsWith('mesh/'))) {
                    ws.send(JSON.stringify({ action: 'removemeshuser', meshid: args.id, userid: ugrpid, responseid: 'meshctrl' }));
                    break;
                }

                // Remove a device from a user group
                if (args.nodeid != null) {
                    var nodeid = args.nodeid;
                    if ((args.domain != null) && (userid.indexOf('/') < 0)) { nodeid = 'node/' + args.domain + '/' + nodeid; }
                    ws.send(JSON.stringify({ action: 'adddeviceuser', nodeid: nodeid, userids: [ugrpid], rights: 0, responseid: 'meshctrl', remove: true }));
                    break;
                }

                if ((args.id != null) && (args.id.startsWith('node/'))) {
                    ws.send(JSON.stringify({ action: 'adddeviceuser', nodeid: args.id, userids: [ugrpid], rights: 0, responseid: 'meshctrl', remove: true }));
                    break;
                }

                break;
            }
            case 'adddevicegroup': {
                var op = { action: 'createmesh', meshname: args.name, meshtype: 2, responseid: 'meshctrl' };
                if (args.desc) { op.desc = args.desc; }
                if (args.amtonly) { op.meshtype = 1; }
                if (args.features) { op.flags = parseInt(args.features); }
                if (args.consent) { op.consent = parseInt(args.consent); }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'removedevicegroup': {
                var op = { action: 'deletemesh', responseid: 'meshctrl' };
                if (args.id) { op.meshid = args.id; } else if (args.group) { op.meshname = args.group; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'editdevicegroup': {
                var op = { action: 'editmesh', responseid: 'meshctrl' };
                if (args.id) { op.meshid = args.id; } else if (args.group) { op.meshidname = args.group; }
                if ((typeof args.name == 'string') && (args.name != '')) { op.meshname = args.name; }
                if (args.desc === true) { op.desc = ""; } else if (typeof args.desc == 'string') { op.desc = args.desc; }
                if (args.invitecodes === true) { op.invite = "*"; } else if (typeof args.invitecodes == 'string') {
                    var invitecodes = args.invitecodes.split(','), invitecodes2 = [];
                    for (var i in invitecodes) { if (invitecodes[i].length > 0) { invitecodes2.push(invitecodes[i]); } }
                    if (invitecodes2.length > 0) {
                        op.invite = { codes: invitecodes2, flags: 0 };
                        if (args.backgroundonly === true) { op.invite.flags = 2; }
                        else if (args.interactiveonly === true) { op.invite.flags = 1; }
                    }
                }
                if (args.flags != null) {
                    var flags = parseInt(args.flags);
                    if (typeof flags == 'number') { op.flags = flags; }
                }
                if (args.consent != null) {
                    var consent = parseInt(args.consent);
                    if (typeof consent == 'number') { op.consent = consent; }
                }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'movetodevicegroup': {
                var op = { action: 'changeDeviceMesh', responseid: 'meshctrl', nodeids: [ args.devid ] };
                if (args.id) { op.meshid = args.id; } else if (args.group) { op.meshname = args.group; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'addusertodevicegroup': {
                var meshrights = 0;
                if (args.fullrights) { meshrights = 0xFFFFFFFF; }
                if (args.editgroup) { meshrights |= 1; }
                if (args.manageusers) { meshrights |= 2; }
                if (args.managedevices) { meshrights |= 4; }
                if (args.remotecontrol) { meshrights |= 8; }
                if (args.agentconsole) { meshrights |= 16; }
                if (args.serverfiles) { meshrights |= 32; }
                if (args.wakedevices) { meshrights |= 64; }
                if (args.notes) { meshrights |= 128; }
                if (args.desktopviewonly) { meshrights |= 256; }
                if (args.noterminal) { meshrights |= 512; }
                if (args.nofiles) { meshrights |= 1024; }
                if (args.noamt) { meshrights |= 2048; }
                if (args.limiteddesktop) { meshrights |= 4096; }
                if (args.limitedevents) { meshrights |= 8192; }
                if (args.chatnotify) { meshrights |= 16384; }
                if (args.uninstall) { meshrights |= 32768; }
                var op = { action: 'addmeshuser', usernames: [args.userid], meshadmin: meshrights, responseid: 'meshctrl' };
                if (args.id) { op.meshid = args.id; } else if (args.group) { op.meshname = args.group; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'removeuserfromdevicegroup': {
                var op = { action: 'removemeshuser', userid: args.userid, responseid: 'meshctrl' };
                if (args.id) { op.meshid = args.id; } else if (args.group) { op.meshname = args.group; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'addusertodevice': {
                var meshrights = 0;
                if (args.fullrights) { meshrights = (8 + 16 + 32 + 64 + 128 + 16384 + 32768); }
                if (args.remotecontrol) { meshrights |= 8; }
                if (args.agentconsole) { meshrights |= 16; }
                if (args.serverfiles) { meshrights |= 32; }
                if (args.wakedevices) { meshrights |= 64; }
                if (args.notes) { meshrights |= 128; }
                if (args.desktopviewonly) { meshrights |= 256; }
                if (args.noterminal) { meshrights |= 512; }
                if (args.nofiles) { meshrights |= 1024; }
                if (args.noamt) { meshrights |= 2048; }
                if (args.limiteddesktop) { meshrights |= 4096; }
                if (args.limitedevents) { meshrights |= 8192; }
                if (args.chatnotify) { meshrights |= 16384; }
                if (args.uninstall) { meshrights |= 32768; }
                var op = { action: 'adddeviceuser', nodeid: args.id, usernames: [args.userid], rights: meshrights, responseid: 'meshctrl' };
                ws.send(JSON.stringify(op));
                break;
            }
            case 'removeuserfromdevice': {
                var op = { action: 'adddeviceuser', nodeid: args.id, usernames: [args.userid], rights: 0, remove: true, responseid: 'meshctrl' };
                ws.send(JSON.stringify(op));
                break;
            }
            case 'sendinviteemail': {
                var op = { action: 'inviteAgent', email: args.email, name: '', os: '0', responseid: 'meshctrl' }
                if (args.id) { op.meshid = args.id; } else if (args.group) { op.meshname = args.group; }
                if (args.name) { op.name = args.name; }
                if (args.message) { op.msg = args.message; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'generateinvitelink': {
                var op = { action: 'createInviteLink', expire: args.hours, flags: 0, responseid: 'meshctrl' }
                if (args.id) { op.meshid = args.id; } else if (args.group) { op.meshname = args.group; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'broadcast': {
                var op = { action: 'userbroadcast', msg: args.msg, responseid: 'meshctrl' };
                if (args.user) { op.userid = args.user; }
                ws.send(JSON.stringify(op));
                break;
            }
            case 'showevents': {
                console.log('Connected. Press ctrl-c to end.');
                break;
            }
            case 'deviceinfo': {
                settings.deviceinfocount = 3;
                ws.send(JSON.stringify({ action: 'getnetworkinfo', nodeid: args.id, nodeinfo: true, responseid: 'meshctrl' }));
                ws.send(JSON.stringify({ action: 'lastconnect', nodeid: args.id, nodeinfo: true, responseid: 'meshctrl' }));
                ws.send(JSON.stringify({ action: 'getsysinfo', nodeid: args.id, nodeinfo: true, responseid: 'meshctrl' }));
                break;
            }
            case 'runcommand': {
                var runAsUser = 0;
                if (args.runasuser) { runAsUser = 1; } else if (args.runasuseronly) { runAsUser = 2; }
                ws.send(JSON.stringify({ action: 'runcommands', nodeids: [args.id], type: ((args.powershell) ? 2 : 0), cmds: args.run, responseid: 'meshctrl', runAsUser: runAsUser }));
                break;
            }
            case 'shell':
            case 'upload':
            case 'download': {
                ws.send("{\"action\":\"authcookie\"}");
                break;
            }
            case 'deviceopenurl': {
                ws.send(JSON.stringify({ action: 'msg', type: 'openUrl', nodeid: args.id, url: args.openurl, responseid: 'meshctrl' }));
                break;
            }
            case 'devicemessage': {
                ws.send(JSON.stringify({ action: 'msg', type: 'messagebox', nodeid: args.id, title: args.title ? args.title : "MeshCentral", msg: args.msg, responseid: 'meshctrl' }));
                break;
            }
            case 'devicetoast': {
                ws.send(JSON.stringify({ action: 'toast', nodeids: [args.id], title: args.title ? args.title : "MeshCentral", msg: args.msg, responseid: 'meshctrl' }));
                break;
            }
        }
    });

    ws.on('close', function() { process.exit(); });
    ws.on('error', function (err) {
        if (err.code == 'ENOTFOUND') { console.log('Unable to resolve ' + url); }
        else if (err.code == 'ECONNREFUSED') { console.log('Unable to connect to ' + url); }
        else { console.log(err); }
        process.exit();
    });

    ws.on('message', function incoming(rawdata) {
        var data = null;
        try { data = JSON.parse(rawdata); } catch (ex) { }
        if (data == null) { console.log('Unable to parse data: ' + rawdata); }
        if (settings.cmd == 'showevents') {
            if (args.filter == null) {
                // Display all events
                console.log(JSON.stringify(data, null, 2));
            } else {
                // Display select events
                var filters = args.filter.split(',');
                if (typeof data.event == 'object') {
                    if (filters.indexOf(data.event.action) >= 0) { console.log(JSON.stringify(data, null, 2) + '\r\n'); }
                } else {
                    if (filters.indexOf(data.action) >= 0) { console.log(JSON.stringify(data, null, 2) + '\r\n'); }
                }
            }
            return;
        }
        switch (data.action) {
            case 'serverinfo': { // SERVERINFO
                settings.currentDomain = data.serverinfo.domain;
                if (settings.cmd == 'serverinfo') {
                    if (args.json) {
                        console.log(JSON.stringify(data.serverinfo, ' ', 2));
                    } else {
                        for (var i in data.serverinfo) { console.log(i + ':', data.serverinfo[i]); }
                    }
                    process.exit();
                }
                break;
            }
            case 'authcookie': { // SHELL, UPLOAD, DOWNLOAD
                if ((settings.cmd == 'shell') || (settings.cmd == 'upload') || (settings.cmd == 'download')) {
                    var protocol = 1; // Terminal
                    if ((settings.cmd == 'upload') || (settings.cmd == 'download')) { protocol = 5; } // Files
                    if ((args.id.split('/') != 3) && (settings.currentDomain != null)) { args.id = 'node/' + settings.currentDomain + '/' + args.id; }
                    var id = getRandomHex(6);
                    ws.send(JSON.stringify({ action: 'msg', nodeid: args.id, type: 'tunnel', usage: 1, value: '*/meshrelay.ashx?p=' + protocol + '&nodeid=' + args.id + '&id=' + id + '&rauth=' + data.rcookie, responseid: 'meshctrl' }));
                    connectTunnel(url.replace('/control.ashx', '/meshrelay.ashx?browser=1&p=' + protocol + '&nodeid=' + args.id + '&id=' + id + '&auth=' + data.cookie));
                }
                break;
            }
            case 'userinfo': { // USERINFO
                if (settings.cmd == 'userinfo') {
                    if (args.json) {
                        console.log(JSON.stringify(data.userinfo, ' ', 2));
                    } else {
                        for (var i in data.userinfo) { console.log(i + ':', data.userinfo[i]); }
                    }
                    process.exit();
                }
                break;
            }
            case 'getsysinfo': { // DEVICEINFO
                if (settings.cmd == 'deviceinfo') {
                    if (data.result) {
                        console.log(data.result);
                        process.exit();
                    } else {
                        settings.sysinfo = data;
                        if (--settings.deviceinfocount == 0) { displayDeviceInfo(settings.sysinfo, settings.lastconnect, settings.networking); process.exit(); }
                    }
                }
                break;
            }
            case 'lastconnect': {
                if (settings.cmd == 'deviceinfo') {
                    settings.lastconnect = (data.result)?null:data;
                    if (--settings.deviceinfocount == 0) { displayDeviceInfo(settings.sysinfo, settings.lastconnect, settings.networking); process.exit(); }
                }
                break;
            }
            case 'getnetworkinfo': {
                if (settings.cmd == 'deviceinfo') {
                    settings.networking = (data.result) ? null : data;
                    if (--settings.deviceinfocount == 0) { displayDeviceInfo(settings.sysinfo, settings.lastconnect, settings.networking); process.exit(); }
                }
                break;
            }
            case 'msg': // SHELL
            case 'toast': // TOAST
            case 'adduser': // ADDUSER
            case 'deleteuser': // REMOVEUSER
            case 'createmesh': // ADDDEVICEGROUP
            case 'deletemesh': // REMOVEDEVICEGROUP
            case 'editmesh': // EDITDEVICEGROUP
            case 'changeDeviceMesh':
            case 'addmeshuser': //
            case 'removemeshuser': //
            case 'inviteAgent': //
            case 'adddeviceuser': //
            case 'createusergroup': //
            case 'deleteusergroup': //
            case 'runcommands':
            case 'addusertousergroup':
            case 'removeuserfromusergroup':
            case 'userbroadcast': { // BROADCAST
                if (settings.cmd == 'upload') return;
                if ((settings.multiresponse != null) && (settings.multiresponse > 1)) { settings.multiresponse--; break; }
                if (data.responseid == 'meshctrl') {
                    if (data.meshid) { console.log(data.result, data.meshid); }
                    else if (data.userid) { console.log(data.result, data.userid); }
                    else console.log(data.result);
                    process.exit();
                }
                break;
            }
            case 'createInviteLink':
                if (data.responseid == 'meshctrl') {
                    if (data.url) { console.log(data.url); }
                    else console.log(data.result);
                    process.exit();
                }
                break;
            case 'wssessioncount': { // LIST USER SESSIONS
                if (args.json) {
                    console.log(JSON.stringify(data.wssessions, ' ', 2));
                } else {
                    for (var i in data.wssessions) { console.log(i + ', ' + ((data.wssessions[i] > 1) ? (data.wssessions[i] + ' sessions.') : ("1 session."))); }
                }
                process.exit();
                break;
            }
            case 'usergroups': { // LIST USER GROUPS
                if (settings.cmd == 'listusergroups') {
                    if (args.json) {
                        console.log(JSON.stringify(data.ugroups, ' ', 2));
                    } else {
                        for (var i in data.ugroups) {
                            var x = i + ', ' + data.ugroups[i].name;
                            if (data.ugroups[i].desc && (data.ugroups[i].desc != '')) { x += ', ' + data.ugroups[i].desc; }
                            console.log(x);
                            var mesh = [], user = [], node = [];
                            if (data.ugroups[i].links != null) { for (var j in data.ugroups[i].links) { if (j.startsWith('mesh/')) { mesh.push(j); } if (j.startsWith('user/')) { user.push(j); } if (j.startsWith('node/')) { node.push(j); } } }
                            console.log('  Users:'); 
                            if (user.length > 0) { for (var j in user) { console.log('    ' + user[j]); } } else { console.log('    (None)'); }
                            console.log('  Device Groups:'); 
                            if (mesh.length > 0) { for (var j in mesh) { console.log('    ' + mesh[j] + ', ' + data.ugroups[i].links[mesh[j]].rights); } } else { console.log('    (None)'); }
                            console.log('  Devices:'); 
                            if (node.length > 0) { for (var j in node) { console.log('    ' + node[j] + ', ' + data.ugroups[i].links[node[j]].rights); } } else { console.log('    (None)'); }
                        }
                    }
                    process.exit();
                } else if (settings.cmd == 'removeallusersfromusergroup') {
                    var ugrpid = args.groupid, exit = false;
                    if ((args.domain != null) && (userid.indexOf('/') < 0)) { ugrpid = 'ugrp/' + args.domain + '/' + ugrpid; }
                    var ugroup = data.ugroups[ugrpid];
                    if (ugroup == null) {
                        console.log('User group not found.');
                        exit = true;
                    } else {
                        var usercount = 0;
                        if (ugroup.links) {
                            for (var i in ugroup.links) {
                                if (i.startsWith('user/')) {
                                    usercount++;
                                    ws.send(JSON.stringify({ action: 'removeuserfromusergroup', ugrpid: ugrpid, userid: i, responseid: 'meshctrl' }));
                                    console.log('Removing ' + i);
                                }
                            }
                        }
                        if (usercount == 0) { console.log('No users in this user group.'); exit = true; } else { settings.multiresponse = usercount; }
                    }
                    if (exit) { process.exit(); }
                }
                break;
            }
            case 'users': { // LISTUSERS
                if (data.result) { console.log(data.result); process.exit(); return; }
                if (args.filter) {
                    // Filter the list of users
                    var filters = args.filter.toLowerCase().split(',');
                    var filteredusers = [];
                    for (var i in data.users) {
                        var ok = false;
                        if ((filters.indexOf('2fa') >= 0) && ((data.users[i].otphkeys != null) || (data.users[i].otpkeys != null) || (data.users[i].otpsecret != null))) { ok = true; }
                        if ((filters.indexOf('no2fa') >= 0) && ((data.users[i].otphkeys == null) && (data.users[i].otpkeys == null) && (data.users[i].otpsecret == null))) { ok = true; }
                        if (ok == true) { filteredusers.push(data.users[i]); }
                    }
                    data.users = filteredusers;
                }
                if (args.json) {
                    console.log(JSON.stringify(data.users, ' ', 2));
                } else {
                    if (args.idexists) { for (var i in data.users) { const u = data.users[i]; if ((u._id == args.idexists) || (u._id.split('/')[2] == args.idexists)) { console.log('1'); process.exit(); return; } } console.log('0'); process.exit(); return; }
                    if (args.nameexists) { for (var i in data.users) { const u = data.users[i]; if (u.name == args.nameexists) { console.log(u._id); process.exit(); return; } } process.exit(); return; }

                    console.log('id, name, email\r\n---------------');
                    for (var i in data.users) {
                        const u = data.users[i];
                        var t = "\"" + u._id.split('/')[2] + "\", \"" + u.name + "\"";
                        if (u.email != null) { t += ", \"" + u.email + "\""; }
                        console.log(t);
                    }
                }
                process.exit();
                break;
            }
            case 'nodes': {
                if ((settings.cmd == 'listdevices') && (data.responseid == 'meshctrl')) {
                    if ((data.result != null) && (data.result != 'ok')) {
                        console.log(data.result);
                    } else {
                        if (args.csv) {
                            // Return a flat list
                            var nodecount = 0;
                            for (var i in data.nodes) {
                                var devicesInMesh = data.nodes[i];
                                for (var j in devicesInMesh) {
                                    var n = devicesInMesh[j];
                                    nodecount++;
                                    console.log('\"' + settings.xmeshes[i]._id.split('/')[2] + '\",\"' + settings.xmeshes[i].name.split('\"').join('') + '\",\"' + n._id.split('/')[2] + '\",\"' + n.name.split('\"').join('') + '\",' + (n.icon ? n.icon : 0) + ',' + (n.conn ? n.conn : 0) + ',' + (n.pwr ? n.pwr : 0));
                                }
                            }
                            if (nodecount == 0) { console.log('None'); }
                        } else if (args.count) {
                            // Return how many devices are in this group
                            var nodes = [];
                            for (var i in data.nodes) { var devicesInMesh = data.nodes[i]; for (var j in devicesInMesh) { nodes.push(devicesInMesh[j]); } }
                            console.log(nodes.length);
                        } else if (args.json) {
                            // Return all devices in JSON format
                            var nodes = [];
                            for (var i in data.nodes) { var devicesInMesh = data.nodes[i]; for (var j in devicesInMesh) { nodes.push(devicesInMesh[j]); } }
                            console.log(JSON.stringify(nodes, ' ', 2));
                        } else {
                            // Display the list of nodes in text format
                            var nodecount = 0;
                            for (var i in data.nodes) {
                                var devicesInMesh = data.nodes[i];
                                if (settings.xmeshes) { console.log('\r\nDevice group: \"' + settings.xmeshes[i].name.split('\"').join('') + '\"'); }
                                console.log('id, name, icon, conn, pwr, ip\r\n-----------------------------');
                                for (var j in devicesInMesh) {
                                    var n = devicesInMesh[j];
                                    nodecount++;
                                    console.log('\"' + n._id.split('/')[2] + '\", \"' + n.name.split('\"').join('') + '\", ' + (n.icon ? n.icon : 0) + ', ' + (n.conn ? n.conn : 0) + ', ' + (n.pwr ? n.pwr : 0));
                                }
                            }
                            if (nodecount == 0) { console.log('None'); }
                        }
                    }
                    process.exit();
                }
                break;
            }
            case 'meshes': { // LISTDEVICEGROUPS
                if (settings.cmd == 'listdevices') {
                    // Store the list of device groups for later use
                    settings.xmeshes = {}
                    for (var i in data.meshes) { settings.xmeshes[data.meshes[i]._id] = data.meshes[i]; }
                } else if (settings.cmd == 'listdevicegroups') {
                    if (args.json) {
                        // If asked, add the MeshID hex encoding to the JSON.
                        if (args.hex) { for (var i in data.meshes) { data.meshes[i]._idhex = '0x' + Buffer.from(data.meshes[i]._id.split('/')[2].replace(/\@/g, '+').replace(/\$/g, '/'), 'base64').toString('hex').toUpperCase(); } }
                        console.log(JSON.stringify(data.meshes, ' ', 2));
                    } else {
                        if (args.idexists) { for (var i in data.meshes) { const u = data.meshes[i]; if ((u._id == args.idexists) || (u._id.split('/')[2] == args.idexists)) { console.log('1'); process.exit(); return; } } console.log('0'); process.exit(); return; }
                        if (args.nameexists) { for (var i in data.meshes) { const u = data.meshes[i]; if (u.name == args.nameexists) { console.log(u._id); process.exit(); return; } } process.exit(); return; }

                        console.log('id, name\r\n---------------');
                        for (var i in data.meshes) {
                            const m = data.meshes[i];
                            var mid = m._id.split('/')[2];
                            if (args.hex) { mid = '0x' + Buffer.from(mid.replace(/\@/g, '+').replace(/\$/g, '/'), 'base64').toString('hex').toUpperCase(); }
                            var t = "\"" + mid + "\", \"" + m.name + "\"";
                            console.log(t);
                        }
                    }
                    process.exit();
                } else if (settings.cmd == 'listusersofdevicegroup') {
                    for (var i in data.meshes) {
                        const m = data.meshes[i];
                        var mid = m._id.split('/')[2];
                        if (mid == args.id) {
                            if (args.json) {
                                console.log(JSON.stringify(m.links, ' ', 2));
                            } else {
                                console.log('userid, rights\r\n---------------');
                                for (var l in m.links) {
                                    var rights = m.links[l].rights;
                                    var rightsstr = [];
                                    if (rights == 4294967295) { rightsstr = ['FullAdministrator']; } else {
                                        if (rights & 1) { rightsstr.push('EditMesh'); }
                                        if (rights & 2) { rightsstr.push('ManageUsers'); }
                                        if (rights & 4) { rightsstr.push('ManageComputers'); }
                                        if (rights & 8) { rightsstr.push('RemoteControl'); }
                                        if (rights & 16) { rightsstr.push('AgentConsole'); }
                                        if (rights & 32) { rightsstr.push('ServerFiles'); }
                                        if (rights & 64) { rightsstr.push('WakeDevice'); }
                                        if (rights & 128) { rightsstr.push('SetNotes'); }
                                        if (rights & 256) { rightsstr.push('RemoteViewOnly'); }
                                        if (rights & 512) { rightsstr.push('NoTerminal'); }
                                        if (rights & 1024) { rightsstr.push('NoFiles'); }
                                        if (rights & 2048) { rightsstr.push('NoAMT'); }
                                        if (rights & 4096) { rightsstr.push('DesktopLimitedInput'); }
                                    }
                                    console.log(l.split('/')[2] + ', ' + rightsstr.join(', '));
                                }
                            }
                            process.exit();
                            return;
                        }
                    }
                    console.log('Group id not found');
                    process.exit();
                }
                break;
            }
            case 'close': {
                if (data.cause == 'noauth') {
                    if (data.msg == 'tokenrequired') {
                        console.log('Authentication token required, use --token [number].');
                    } else {
                        if ((args.loginkeyfile != null) || (args.loginkey != null)) {
                            console.log('Invalid login, check the login key and that this computer has the correct time.');
                        } else {
                            console.log('Invalid login.');
                        }
                    }
                }
                process.exit();
                break;
            }
            default: { break; }
        }
        //console.log('Data', data);
        //setTimeout(function timeout() { ws.send(Date.now()); }, 500);
    });
}

// Connect tunnel to a remote agent
function connectTunnel(url) {
    // Setup WebSocket options
    var options = { rejectUnauthorized: false, checkServerIdentity: onVerifyServer }

    // Setup the HTTP proxy if needed
    if (args.proxy != null) { const HttpsProxyAgent = require('https-proxy-agent'); options.agent = new HttpsProxyAgent(require('url').parse(args.proxy)); }

    // Connect the WebSocket
    console.log('Connecting...');
    const WebSocket = require('ws');
    settings.tunnelwsstate = 0;
    settings.tunnelws = new WebSocket(url, options);
    settings.tunnelws.on('open', function () { console.log('Waiting for Agent...'); }); // Wait for agent connection
    settings.tunnelws.on('close', function () { console.log('Connection Closed.'); process.exit(); });
    settings.tunnelws.on('error', function (err) { console.log(err); process.exit(); });

    if (settings.cmd == 'shell') {
        // This code does all of the work for a shell command
        settings.tunnelws.on('message', function (rawdata) {
            var data = rawdata.toString();
            if (settings.tunnelwsstate == 1) {
                process.stdout.write(data);
            } else if (settings.tunnelwsstate == 0) {
                if (data == 'c') { console.log('Connected.'); } else if (data == 'cr') { console.log('Connected, session is being recorded.'); } else return;
                // Send terminal size
                var termSize = null;
                if (typeof process.stdout.getWindowSize == 'function') { termSize = process.stdout.getWindowSize(); }
                if (termSize != null) { settings.tunnelws.send(JSON.stringify({ ctrlChannel: '102938', type: 'options', cols: termSize[0], rows: termSize[1] })); }
                settings.tunnelwsstate = 1;
                settings.tunnelws.send('1'); // Terminal
                process.stdin.setEncoding('utf8');
                process.stdin.setRawMode(true);
                process.stdout.setEncoding('utf8');
                process.stdin.unpipe(process.stdout);
                process.stdout.unpipe(process.stdin);
                process.stdin.on('data', function (data) { settings.tunnelws.send(Buffer.from(data)); });
                //process.stdin.on('readable', function () { var chunk; while ((chunk = process.stdin.read()) !== null) { settings.tunnelws.send(Buffer.from(chunk)); } });
                process.stdin.on('end', function () { process.exit(); });
                process.stdout.on('resize', function () {
                    var termSize = null;
                    if (typeof process.stdout.getWindowSize == 'function') { termSize = process.stdout.getWindowSize(); }
                    if (termSize != null) { settings.tunnelws.send(JSON.stringify({ ctrlChannel: '102938', type: 'termsize', cols: termSize[0], rows: termSize[1] })); }
                });
            }
        });
    } else if (settings.cmd == 'upload') {
        // This code does all of the work for a file upload
        // node meshctrl upload --id oL4Y6Eg0qjnpHFrp1AxfxnBPenbDGnDSkC@HSOnAheIyd51pKhqSCUgJZakzwfKl --file readme.md --target c:\
        settings.tunnelws.on('message', function (rawdata) {
            if (settings.tunnelwsstate == 1) {
                var cmd = null;
                try { cmd = JSON.parse(rawdata.toString()); } catch (ex) { return; }
                if (cmd.reqid == 'up') {
                    if ((cmd.action == 'uploadack') || (cmd.action == 'uploadstart')) {
                        var buf = Buffer.alloc(4096);
                        var len = require('fs').readSync(settings.uploadFile, buf, 0, 4096, settings.uploadPtr);
                        settings.uploadPtr += len;
                        if (len > 0) {
                            settings.tunnelws.send(buf.slice(0, len));
                        } else {
                            console.log('Upload done, ' + settings.uploadPtr + ' bytes sent.');
                            if (settings.uploadFile != null) { require('fs').closeSync(settings.uploadFile); }
                            process.exit();
                        }
                    } else if (cmd.action == 'uploaderror') {
                        if (settings.uploadFile != null) { require('fs').closeSync(settings.uploadFile); }
                        console.log('Upload error.');
                        process.exit();
                    }
                }
            } else if (settings.tunnelwsstate == 0) {
                var data = rawdata.toString();
                if (data == 'c') { console.log('Connected.'); } else if (data == 'cr') { console.log('Connected, session is being recorded.'); } else return;
                settings.tunnelwsstate = 1;
                settings.tunnelws.send('5'); // Files
                settings.uploadSize = require('fs').statSync(args.file).size;
                settings.uploadFile = require('fs').openSync(args.file, 'r');
                settings.uploadPtr = 0;
                settings.tunnelws.send(JSON.stringify({ action: 'upload', reqid: 'up', path: args.target, name: require('path').basename(args.file), size: settings.uploadSize }));
            }
        });
    } else if (settings.cmd == 'download') {
        // This code does all of the work for a file download
        // node meshctrl download --id oL4Y6Eg0qjnpHFrp1AxfxnBPenbDGnDSkC@HSOnAheIyd51pKhqSCUgJZakzwfKl --file c:\temp\MC-8Languages.png --target c:\temp\bob.png
        settings.tunnelws.on('message', function (rawdata) {
            if (settings.tunnelwsstate == 1) {
                if ((rawdata.length > 0) && (rawdata[0] != '{')) {
                    // This is binary data, this test is ok because 4 first bytes is a control value.
                    if ((rawdata.length > 4) && (settings.downloadFile != null)) { settings.downloadSize += (rawdata.length - 4); require('fs').writeSync(settings.downloadFile, rawdata, 4, rawdata.length - 4); }
                    if ((rawdata[3] & 1) != 0) { // Check end flag
                        // File is done, close everything.
                        if (settings.downloadFile != null) { require('fs').closeSync(settings.downloadFile); }
                        console.log('Download completed, ' + settings.downloadSize + ' bytes written.');
                        process.exit();
                    } else {
                        settings.tunnelws.send(JSON.stringify({ action: 'download', sub: 'ack', id: args.file })); // Send the ACK
                    }
                } else {
                    // This is text data
                    var cmd = null;
                    try { cmd = JSON.parse(rawdata.toString()); } catch (ex) { return; }
                    if (cmd.action == 'download') {
                        if (cmd.id != args.file) return;
                        if (cmd.sub == 'start') {
                            settings.downloadFile = require('fs').openSync(args.target, 'w');
                            settings.downloadSize = 0;
                            settings.tunnelws.send(JSON.stringify({ action: 'download', sub: 'startack', id: args.file }));
                            console.log('Download started...');
                        } else if (cmd.sub == 'cancel') {
                            if (settings.downloadFile != null) { require('fs').closeSync(settings.downloadFile); }
                            console.log('Download canceled.');
                            process.exit();
                        }
                    }
                }
            } else if (settings.tunnelwsstate == 0) {
                var data = rawdata.toString();
                if (data == 'c') { console.log('Connected.'); } else if (data == 'cr') { console.log('Connected, session is being recorded.'); } else return;
                settings.tunnelwsstate = 1;
                settings.tunnelws.send('5'); // Files
                settings.tunnelws.send(JSON.stringify({ action: 'download', sub: 'start', id: args.file, path: args.file }));
            }
        });
    }
}

// Encode an object as a cookie using a key using AES-GCM. (key must be 32 bytes or more)
function encodeCookie(o, key) {
    try {
        if (key == null) { return null; }
        o.time = Math.floor(Date.now() / 1000); // Add the cookie creation time
        const iv = Buffer.from(crypto.randomBytes(12), 'binary'), cipher = crypto.createCipheriv('aes-256-gcm', key.slice(0, 32), iv);
        const crypted = Buffer.concat([cipher.update(JSON.stringify(o), 'utf8'), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), crypted]).toString('base64').replace(/\+/g, '@').replace(/\//g, '$');
    } catch (e) { return null; }
}

// Generate a random Intel AMT password
function checkAmtPassword(p) { return (p.length > 7) && (/\d/.test(p)) && (/[a-z]/.test(p)) && (/[A-Z]/.test(p)) && (/\W/.test(p)); }
function getRandomAmtPassword() { var p; do { p = Buffer.from(crypto.randomBytes(9), 'binary').toString('base64').split('/').join('@'); } while (checkAmtPassword(p) == false); return p; }
function getRandomHex(count) { return Buffer.from(crypto.randomBytes(count), 'binary').toString('hex'); }
function format(format) { var args = Array.prototype.slice.call(arguments, 1); return format.replace(/{(\d+)}/g, function (match, number) { return typeof args[number] != 'undefined' ? args[number] : match; }); };
function winRemoveSingleQuotes(str) { if (process.platform != 'win32') return str; else return str.split('\'').join(''); }

function displayDeviceInfo(sysinfo, lastconnect, network) {
    var node = sysinfo.node;
    var hardware = sysinfo.hardware;
    var info = {};

    if (network != null) { sysinfo.netif = network.netif; }
    if (lastconnect != null) { node.lastconnect = lastconnect.time; node.lastaddr = lastconnect.addr; }
    if (args.raw) { console.log(JSON.stringify(sysinfo, ' ', 2)); return; }

    // General
    var output = {}, outputCount = 0;
    if (node.rname) { output["Server Name"] = node.name; outputCount++; }
    if (node.host != null) { output["Hostname"] = node.host; outputCount++; }
    if (node.ip != null) { output["IP Address"] = node.ip; outputCount++; }
    if (node.desc != null) { output["Description"] = node.desc; outputCount++; }
    if (node.icon != null) { output["Icon"] = node.icon; outputCount++; }
    if (node.tags) { output["Tags"] = node.tags; outputCount++; }
    if (node.av) {
        var av = [];
        for (var i in node.av) {
            if (typeof node.av[i]['product'] == 'string') {
                var n = node.av[i]['product'];
                if (node.av[i]['updated'] === true) { n += ', updated'; }
                if (node.av[i]['updated'] === false) { n += ', not updated'; }
                if (node.av[i]['enabled'] === true) { n += ', enabled'; }
                if (node.av[i]['enabled'] === false) { n += ', disabled'; }
                av.push(n);
            }
        }
        output["AntiVirus"] = av; outputCount++;
    }
    if (outputCount > 0) { info["General"] = output; }

    // Operating System
    if ((hardware.windows && hardware.windows.osinfo) || node.osdesc) {
        var output = {}, outputCount = 0;
        if (node.rname) { output["Name"] = node.rname; outputCount++; }
        if (node.osdesc) { output["Version"] = node.osdesc; outputCount++; }
        if (hardware.windows && hardware.windows.osinfo) { var m = hardware.windows.osinfo; if (m.OSArchitecture) { output["Architecture"] = m.OSArchitecture; outputCount++; } }
        if (outputCount > 0) { info["Operating System"] = output; }
    }

    // MeshAgent
    if (node.agent) {
        var output = {}, outputCount = 0;
        var agentsStr = ["Unknown", "Windows 32bit console", "Windows 64bit console", "Windows 32bit service", "Windows 64bit service", "Linux 32bit", "Linux 64bit", "MIPS", "XENx86", "Android ARM", "Linux ARM", "MacOS 32bit", "Android x86", "PogoPlug ARM", "Android APK", "Linux Poky x86-32bit", "MacOS 64bit", "ChromeOS", "Linux Poky x86-64bit", "Linux NoKVM x86-32bit", "Linux NoKVM x86-64bit", "Windows MinCore console", "Windows MinCore service", "NodeJS", "ARM-Linaro", "ARMv6l / ARMv7l", "ARMv8 64bit", "ARMv6l / ARMv7l / NoKVM", "Unknown", "Unknown", "FreeBSD x86-64"];
        if ((node.agent != null) && (node.agent.id != null) && (node.agent.ver != null)) {
            var str = '';
            if (node.agent.id <= agentsStr.length) { str = agentsStr[node.agent.id]; } else { str = agentsStr[0]; }
            if (node.agent.ver != 0) { str += ' v' + node.agent.ver; }
            output["Mesh Agent"] = str; outputCount++;
        }
        if ((node.conn & 1) != 0) {
            output["Last agent connection"] = "Connected now"; outputCount++;
        } else {
            if (node.lastconnect) { output["Last agent connection"] = new Date(node.lastconnect).toLocaleString(); outputCount++; }
        }
        if (node.lastaddr) {
            var splitip = node.lastaddr.split(':');
            if (splitip.length > 2) {
                output["Last agent address"] = node.lastaddr; outputCount++; // IPv6
            } else {
                output["Last agent address"] = splitip[0]; outputCount++; // IPv4
            }
        }
        if (outputCount > 0) { info["Mesh Agent"] = output; }
    }

    // Networking
    if (network.netif != null) {
        var output = {}, outputCount = 0, minfo = {};
        for (var i in network.netif) {
            var m = network.netif[i], moutput = {}, moutputCount = 0;
            if (m.desc) { moutput["Description"] = m.desc; moutputCount++; }
            if (m.mac) {
                if (m.gatewaymac) {
                    moutput["MAC Layer"] = format("MAC: {0}, Gateway: {1}", m.mac, m.gatewaymac); moutputCount++;
                } else {
                    moutput["MAC Layer"] = format("MAC: {0}", m.mac); moutputCount++;
                }
            }
            if (m.v4addr && (m.v4addr != '0.0.0.0')) {
                if (m.v4gateway && m.v4mask) {
                    moutput["IPv4 Layer"] = format("IP: {0}, Mask: {1}, Gateway: {2}", m.v4addr, m.v4mask, m.v4gateway); moutputCount++;
                } else {
                    moutput["IPv4 Layer"] = format("IP: {0}", m.v4addr); moutputCount++;
                }
            }
            if (moutputCount > 0) { minfo[m.name + (m.dnssuffix ? (', ' + m.dnssuffix) : '')] = moutput; info["Networking"] = minfo; }
        }
    }

    // Intel AMT
    if (node.intelamt != null) {
        var output = {}, outputCount = 0;
        output["Version"] = (node.intelamt.ver) ? ('v' + node.intelamt.ver) : ('<i>' + "Unknown" + '</i>'); outputCount++;
        var provisioningStates = { 0: "Not Activated (Pre)", 1: "Not Activated (In)", 2: "Activated" };
        var provisioningMode = '';
        if ((node.intelamt.state == 2) && node.intelamt.flags) { if (node.intelamt.flags & 2) { provisioningMode = (', ' + "Client Control Mode (CCM)"); } else if (node.intelamt.flags & 4) { provisioningMode = (', ' + "Admin Control Mode (ACM)"); } }
        output["Provisioning State"] = ((node.intelamt.state) ? (provisioningStates[node.intelamt.state]) : ('<i>' + "Unknown" + '</i>')) + provisioningMode; outputCount++;
        output["Security"] = (node.intelamt.tls == 1) ? "Secured using TLS" : "TLS is not setup"; outputCount++;
        output["Admin Credentials"] = (node.intelamt.user == null || node.intelamt.user == '') ? "Not Known" : "Known"; outputCount++;
        if (outputCount > 0) { info["Intel Active Management Technology (Intel AMT)"] = output; }
    }

    if (hardware.identifiers) {
        var output = {}, outputCount = 0, ident = hardware.identifiers;
        // BIOS
        if (ident.bios_vendor) { output["Vendor"] = ident.bios_vendor; outputCount++; }
        if (ident.bios_version) { output["Version"] = ident.bios_version; outputCount++; }
        if (outputCount > 0) { info["BIOS"] = output; }
        output = {}, outputCount = 0;

        // Motherboard
        if (ident.board_vendor) { output["Vendor"] = ident.board_vendor; outputCount++; }
        if (ident.board_name) { output["Name"] = ident.board_name; outputCount++; }
        if (ident.board_serial && (ident.board_serial != '')) { output["Serial"] = ident.board_serial; outputCount++; }
        if (ident.board_version) { output["Version"] = ident.board_version; }
        if (ident.product_uuid) { output["Identifier"] = ident.product_uuid; }
        if (ident.cpu_name) { output["CPU"] = ident.cpu_name; }
        if (ident.gpu_name) { for (var i in ident.gpu_name) { output["GPU" + (parseInt(i) + 1)] = ident.gpu_name[i]; } }
        if (outputCount > 0) { info["Motherboard"] = output; }
    }

    // Memory
    if (hardware.windows) {
        if (hardware.windows.memory) {
            var output = {}, outputCount = 0, minfo = {};
            hardware.windows.memory.sort(function (a, b) { if (a.BankLabel > b.BankLabel) return 1; if (a.BankLabel < b.BankLabel) return -1; return 0; });
            for (var i in hardware.windows.memory) {
                var m = hardware.windows.memory[i], moutput = {}, moutputCount = 0;
                if (m.Capacity) { moutput["Capacity/Speed"] = (m.Capacity / 1024 / 1024) + " Mb, " + m.Speed + " Mhz"; moutputCount++; }
                if (m.PartNumber) { moutput["Part Number"] = ((m.Manufacturer && m.Manufacturer != 'Undefined') ? (m.Manufacturer + ', ') : '') + m.PartNumber; moutputCount++; }
                if (moutputCount > 0) { minfo[m.BankLabel] = moutput; info["Memory"] = minfo; }
            }
        }
    }

    // Storage
    if (hardware.identifiers && ident.storage_devices) {
        var output = {}, outputCount = 0, minfo = {};
        // Sort Storage
        ident.storage_devices.sort(function (a, b) { if (a.Caption > b.Caption) return 1; if (a.Caption < b.Caption) return -1; return 0; });
        for (var i in ident.storage_devices) {
            var m = ident.storage_devices[i], moutput = {};
            if (m.Size) {
                if (m.Model && (m.Model != m.Caption)) { moutput["Model"] = m.Model; outputCount++; }
                if ((typeof m.Size == 'string') && (parseInt(m.Size) == m.Size)) { m.Size = parseInt(m.Size); }
                if (typeof m.Size == 'number') { moutput["Capacity"] = Math.floor(m.Size / 1024 / 1024) + 'Mb'; outputCount++; }
                if (typeof m.Size == 'string') { moutput["Capacity"] = m.Size; outputCount++; }
                if (moutputCount > 0) { minfo[m.Caption] = moutput; info["Storage"] = minfo; }
            }
        }
    }

    // Display everything
    if (args.json) {
        console.log(JSON.stringify(info, ' ', 2));
    } else {
        for (var i in info) {
            console.log('--- ' + i + ' ---');
            for (var j in info[i]) {
                if ((typeof info[i][j] == 'string') || (typeof info[i][j] == 'number')) {
                    console.log('  ' + j + ': ' + info[i][j]);
                } else {
                    console.log('  ' + j + ':');
                    for (var k in info[i][j]) {
                        console.log('    ' + k + ': ' + info[i][j][k]);
                    }
                }
            }
        }
    }
}
