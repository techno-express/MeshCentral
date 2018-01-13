#!/bin/sh
export PORT  
export REDIRPORT
export MPSPORT

su - meshserver
cd /home/meshserver/
npm install meshcentral

if [ -f "/etc/letsencrypt/archive/$HOSTNAME/cert1.pem" ]; then
    ln -sf "/etc/letsencrypt/archive/$HOSTNAME/privkey1.pem" meshcentral-data/agentserver-cert-private.key  
    ln -sf "/etc/letsencrypt/archive/$HOSTNAME/cert1.pem" meshcentral-data/agentserver-cert-public.crt
    ln -sf "/etc/letsencrypt/archive/$HOSTNAME/privkey1.pem" meshcentral-data/root-cert-private.key   
    ln -sf "/etc/letsencrypt/archive/$HOSTNAME/cert1.pem" meshcentral-data/root-cert-public.crt     
    ln -sf "/etc/letsencrypt/archive/$HOSTNAME/privkey1.pem" meshcentral-data/webserver-cert-private.key   
    ln -sf "/etc/letsencrypt/archive/$HOSTNAME/cert1.pem" meshcentral-data/webserver-cert-public.crt
    ln -sf "/etc/letsencrypt/archive/$HOSTNAME/privkey1.pem" meshcentral-data/mpsserver-cert-private.key 
    ln -sf "/etc/letsencrypt/archive/$HOSTNAME/cert1.pem" meshcentral-data/mpsserver-cert-public.crt
	node node_modules/meshcentral/meshcentral.js --port $PORT --redirport $REDIRPORT --mpsport $MPSPORT
elif ! [ -f meshcentral-data/agentserver-cert-private.key ] ;then 
	node node_modules/meshcentral/meshcentral.js --cert $HOSTNAME --port $PORT --redirport $REDIRPORT --mpsport $MPSPORT
else
	node node_modules/meshcentral/meshcentral.js --port $PORT --redirport $REDIRPORT --mpsport $MPSPORT
fi
 