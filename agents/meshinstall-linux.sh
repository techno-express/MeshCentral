#!/usr/bin/env bash

CheckStartupType() {
  # 1 = Systemd
  # 2 = Upstart
  # 3 = init.d
  # 5 = BSD

  # echo "Checking if Linux or BSD Platform"
  plattype=`uname | awk '{ tst=tolower($0);a=split(tst, res, "bsd"); if(a==1) { print "LINUX"; } else { print "BSD"; }}'`
  if [[ $plattype == 'BSD' ]]
   then return 5;
  fi

  # echo "Checking process autostart system..."
  starttype1=`cat /proc/1/status | grep 'Name:' | awk '{ print $2; }'`
  starttype2=`ps -p 1 -o command= | awk '{a=split($0,res," "); b=split(res[a],tp,"/"); print tp[b]; }'`
 
  # Systemd
  if [[ $starttype1 == 'systemd' ]]
    then return 1;
  elif [[ $starttype1 == 'init'  ||  $starttype2 == 'init' ]]
<<<<<<< HEAD
	then
		if [ -d "/etc/init" ]
			then
				return 2;
			else
				return 3;
		fi
=======
    then
        if [ -d "/etc/init" ]
            then
                return 2;
            else
                return 3;
        fi
>>>>>>> upstream/master
  fi
  return 0;
}


<<<<<<< HEAD

=======
>>>>>>> upstream/master
# Add "StartupType=(type)" to .msh file
UpdateMshFile() {
  # Remove all lines that start with "StartupType="
  sed '/^StartupType=/ d' < ./meshagent.msh >> ./meshagent2.msh
  # Add the startup type to the file
  echo "StartupType=$starttype" >> ./meshagent2.msh
  mv ./meshagent2.msh ./meshagent.msh
}

CheckInstallAgent() {
  # echo "Checking mesh identifier..."
  if [ -e "/usr/local" ]
  then
    installpath="/usr/local/mesh"
  else
    installpath="/usr/mesh"
  fi
  if [ $# -ge 2 ]
  then
    uninstall=$1
    url=$2
    meshid=$3
    if [[ $4 =~ ^--WebProxy= ]];
    then
       webproxy=$4
    fi



    meshidlen=${#meshid}
    if [ $meshidlen -gt 63 ]
    then
      machineid=0
      machinetype=$( uname -m )

      # If we have 3 arguments...
<<<<<<< HEAD
      if [ $# -ge 3 ]
      then
        # echo "Computer type is specified..."
        machineid=$3
=======
      if [ $# -ge 4 ] &&  [ -z "$webproxy" ]
      then
        # echo "Computer type is specified..."
        machineid=$4
>>>>>>> upstream/master
      else
        # echo "Detecting computer type..."
        if [ $machinetype == 'x86_64' ] || [ $machinetype == 'amd64' ]
        then
<<<<<<< HEAD
		  if [ $starttype -eq 5 ]
		  then
			# FreeBSD x86, 64 bit
			machineid=30
		  else
			# Linux x86, 64 bit
			bitlen=$( getconf LONG_BIT )
			if [ $bitlen == '32' ] 
			then
				# 32 bit OS
				machineid=5
			else
				# 64 bit OS
				machineid=6
			fi
		  fi
        fi
        if [ $machinetype == 'x86' ] || [ $machinetype == 'i686' ] || [ $machinetype == 'i586' ]
        then
			if [ $starttype -eq 5 ]
			then
				# FreeBSD x86, 32 bit
				machineid=31
			else
				# Linux x86, 32 bit
				machineid=5
			fi
=======
          if [ $starttype -eq 5 ]
          then
            # FreeBSD x86, 64 bit
            machineid=30
          else
            # Linux x86, 64 bit
            bitlen=$( getconf LONG_BIT )
            if [ $bitlen == '32' ] 
            then
                # 32 bit OS
                machineid=5
            else
                # 64 bit OS
                machineid=6
            fi
          fi
        fi
        if [ $machinetype == 'x86' ] || [ $machinetype == 'i686' ] || [ $machinetype == 'i586' ]
        then
          if [ $starttype -eq 5 ]
          then
            # FreeBSD x86, 32 bit
            machineid=31
          else
            # Linux x86, 32 bit
            machineid=5
          fi
>>>>>>> upstream/master
        fi
        if [ $machinetype == 'armv6l' ] || [ $machinetype == 'armv7l' ]
        then
          # RaspberryPi 1 (armv6l) or RaspberryPi 2/3 (armv7l)
          machineid=25
        fi
        if [ $machinetype == 'aarch64' ]
        then
          # RaspberryPi 3B+ running Ubuntu 64 (aarch64)
          machineid=26
        fi
        # Add more machine types, detect KVM support... here.
      fi

      if [ $machineid -eq 0 ]
      then
        echo "Unsupported machine type: $machinetype."
      else
        DownloadAgent $uninstall $url $meshid $machineid
      fi

    else
<<<<<<< HEAD
      echo "MeshID is not correct, must be at least 64 characters long."
=======
      echo "Device group identifier is not correct, must be at least 64 characters long."
>>>>>>> upstream/master
    fi
  else
    echo "URI and/or device group identifier have not been specified, must be passed in as arguments."
    return 0;
  fi
}

DownloadAgent() {
<<<<<<< HEAD
  url=$1
  meshid=$2
  machineid=$3
  # Create folder
  mkdir -p /usr/local/mesh
  cd /usr/local/mesh
  echo "Downloading Mesh agent #$machineid..."
  wget $url/meshagents?id=$machineid {{{wgetoptionshttps}}}-O /usr/local/mesh/meshagent || curl {{{curloptionshttps}}}--output /usr/local/mesh/meshagent $url/meshagents?id=$machineid
=======
  uninstall=$1
  url=$2
  meshid=$3
  machineid=$4
  echo "Downloading agent #$machineid..."
  wget $url/meshagents?id=$machineid {{{wgetoptionshttps}}}-O ./meshagent || curl {{{curloptionshttps}}}--output ./meshagent $url/meshagents?id=$machineid
>>>>>>> upstream/master

  # If it did not work, try again using http
  if [ $? != 0 ]
  then
    url=${url/"https://"/"http://"}
<<<<<<< HEAD
    wget $url/meshagents?id=$machineid {{{wgetoptionshttp}}}-O /usr/local/mesh/meshagent || curl {{{curloptionshttp}}}--output /usr/local/mesh/meshagent $url/meshagents?id=$machineid
=======
    wget $url/meshagents?id=$machineid {{{wgetoptionshttp}}}-O ./meshagent || curl {{{curloptionshttp}}}--output ./meshagent $url/meshagents?id=$machineid
>>>>>>> upstream/master
  fi

  if [ $? -eq 0 ]
  then
<<<<<<< HEAD
    echo "Mesh agent downloaded."
    # TODO: We could check the meshagent sha256 hash, but best to authenticate the server.
    chmod 755 /usr/local/mesh/meshagent
    wget $url/meshsettings?id=$meshid {{{wgetoptionshttps}}}-O /usr/local/mesh/meshagent.msh || curl {{{curloptionshttps}}}--output /usr/local/mesh/meshagent.msh $url/meshsettings?id=$meshid
=======
    echo "Agent downloaded."
    # TODO: We could check the meshagent sha256 hash, but best to authenticate the server.
    chmod 755 ./meshagent
    wget $url/meshsettings?id=$meshid {{{wgetoptionshttps}}}-O ./meshagent.msh || curl {{{curloptionshttps}}}--output ./meshagent.msh $url/meshsettings?id=$meshid
>>>>>>> upstream/master

    # If it did not work, try again using http
    if [ $? -ne 0 ]
    then
<<<<<<< HEAD
      wget $url/meshsettings?id=$meshid {{{wgetoptionshttp}}}-O /usr/local/mesh/meshagent.msh || curl {{{curloptionshttp}}}--output /usr/local/mesh/meshagent.msh $url/meshsettings?id=$meshid
=======
      wget $url/meshsettings?id=$meshid {{{wgetoptionshttp}}}-O ./meshagent.msh || curl {{{curloptionshttp}}}--output ./meshagent.msh $url/meshsettings?id=$meshid
>>>>>>> upstream/master
    fi

    if [ $? -eq 0 ]
    then
<<<<<<< HEAD
      UpdateMshFile
      if [ $starttype -eq 1 ]
      then
        # systemd
        if [ -d "/lib/systemd/system/" ]
        then
            echo -e "[Unit]\nDescription=MeshCentral Agent\n[Service]\nWorkingDirectory=/usr/local/mesh\nExecStart=/usr/local/mesh/meshagent\nStandardOutput=null\nRestart=always\nRestartSec=3\n[Install]\nWantedBy=multi-user.target\nAlias=meshagent.service\n" > /lib/systemd/system/meshagent.service
        else
            # Some distros have the systemd folder at a different place
            if [ -d "/usr/lib/systemd/system/" ]
            then
                echo -e "[Unit]\nDescription=MeshCentral Agent\n[Service]\nWorkingDirectory=/usr/local/mesh\nExecStart=/usr/local/mesh/meshagent\nStandardOutput=null\nRestart=always\nRestartSec=3\n[Install]\nWantedBy=multi-user.target\nAlias=meshagent.service\n" > /usr/lib/systemd/system/meshagent.service
            else
                echo "Unable to find systemd folder."
            fi
        fi
        systemctl enable meshagent
        systemctl start meshagent
        echo 'meshagent installed as systemd service.'
        echo 'To start service: sudo systemctl start meshagent'
        echo 'To stop service: sudo systemctl stop meshagent'
      elif [ $starttype -eq 3 ]
          then
          # initd
          wget $url/meshagents?script=2 {{{wgetoptionshttps}}}-O /etc/init.d/meshagent || curl {{{curloptionshttps}}}--output /etc/init.d/meshagent $url/meshagents?script=2
          chmod +x /etc/init.d/meshagent
          # creates symlinks for rc.d
          update-rc.d meshagent defaults
          service meshagent start
          echo 'meshagent installed as init.d service.'
          echo 'To start service: sudo service meshagent start'
          echo 'To stop service: sudo service meshagent stop'
      elif [ $starttype -eq 2 ]
          then
          # upstart
          echo -e "start on runlevel [2345]\nstop on runlevel [016]\n\nrespawn\n\nchdir /usr/local/mesh\nexec /usr/local/mesh/meshagent\n\n" > /etc/init/meshagent.conf
          initctl start meshagent
          echo 'meshagent installed as upstart/init.d service.'
          echo 'To start service: sudo initctl start meshagent'
          echo 'To stop service: sudo initctl stop meshagent'
	  elif [ $starttype -eq 5 ]
          then
		  # FreeBSD
          wget $url/meshagents?script=5 {{{wgetoptionshttps}}}-O /usr/local/etc/rc.d/meshagent || curl {{{curloptionshttps}}}--output /usr/local/etc/rc.d/meshagent $url/meshagents?script=5
          chmod +x /usr/local/etc/rc.d/meshagent
          service meshagent start
          echo 'meshagent installed as BSD service.'
          echo 'To start service: sudo service meshagent start'
          echo 'To stop service: sudo service meshagent stop'
      else
          # unknown
          echo "Unknown Service Platform Type. (ie: init, systemd, etc)"
          echo "Installing as Pseudo Service (Mesh Daemon)"
		  /usr/local/mesh/meshagent -exec "require('service-manager').manager.installService({name: 'meshagent', servicePath: process.execPath, files: ['/usr/local/mesh/meshagent.msh']});process.exit();"
		  /usr/local/mesh_daemons/daemon start meshagent
		  echo 'To start service: /usr/local/mesh_daemons/daemon start meshagent'
		  echo 'To stop service: /usr/local/mesh_daemons/daemon stop meshagent'
      fi
      echo "Mesh agent started."
=======
      # Update the .msh file and run the agent installer/uninstaller
      if [ $uninstall == 'uninstall' ] || [ $uninstall == 'UNINSTALL' ]
      then
        # Uninstall the agent
        ./meshagent -fulluninstall
      else
        # Install the agent
        UpdateMshFile
        ./meshagent -fullinstall --copy-msh=1 $webproxy
      fi
>>>>>>> upstream/master
    else
      echo "Unable to download device group settings at: $url/meshsettings?id=$meshid."
    fi
  else
    echo "Unable to download agent at: $url/meshagents?id=$machineid."
  fi
<<<<<<< HEAD

  if [ $starttype -eq 1 ]
  then
    # systemd
    systemctl disable meshagent
    systemctl stop meshagent
    rm -f /sbin/meshcmd /lib/systemd/system/meshagent.service
    systemctl stop meshagentDiagnostic &> /dev/null
    rm -f /lib/systemd/system/meshagentDiagnostic.service &> /dev/null
  else
    if [ $starttype -eq 3 ]; then
        # initd
        service meshagent stop
        update-rc.d -f meshagent remove
        rm -f /sbin/meshcmd /etc/init.d/meshagent
        service meshagentDiagnostic stop &> /dev/null
        rm -f /etc/init.d/meshagentDiagnostic &> /dev/null
    elif [ $starttype -eq 2 ]; then
        # upstart 
        initctl stop meshagent
        rm -f /sbin/meshcmd 
        rm -f /etc/init/meshagent.conf
        rm -f /etc/rc2.d/S20mesh /etc/rc3.d/S20mesh /etc/rc5.d/S20mesh
        initctl stop meshagentDiagnostic &> /dev/null
        rm -f /etc/init/meshagentDiagnostic.conf &> /dev/null
    elif [ $starttype -eq 5 ]; then
		# FreeBSD
		service meshagent stop
		service meshagentDiagnostic stop &> /dev/null
		rm -f /usr/local/etc/rc.d/meshagent
		rm -f /usr/local/etc/rc.d/meshagentDiagnostic &> /dev/null
	fi
  fi

  if [ -e $installpath ]
  then
    rm -rf $installpath/*
    rmdir $installpath
  fi
  rm -rf /usr/local/mesh_services/meshagentDiagnostic &> /dev/null
  rm -f /etc/cron.d/meshagentDiagnostic_periodicStart &> /dev/null
  echo "Agent uninstalled."
=======
>>>>>>> upstream/master
}


CheckStartupType
starttype=$?
#echo "Type: $starttype"

currentuser=$( whoami )
if [ $currentuser == 'root' ]
then
  if [ $# -eq 0 ]
  then
<<<<<<< HEAD
    echo -e "This script will install or uninstall a mesh agent, usage:\n  $0 [serverurl] [meshid] (machineid)\n  $0 uninstall"
=======
    echo -e "This script will install or uninstall a agent, usage:\n  $0 [serverUrl] [deviceGroupId] (machineId)\n  $0 uninstall [serverUrl] [deviceGroupId] (machineId)"
>>>>>>> upstream/master
  else
    if [ $1 == 'uninstall' ] || [ $1 == 'UNINSTALL' ]
    then
      CheckInstallAgent 'uninstall' $2 $3 $4
    else
<<<<<<< HEAD
      UninstallAgent
      CheckInstallAgent $1 $2 $3
=======
      CheckInstallAgent 'install' $1 $2 $3
>>>>>>> upstream/master
    fi
  fi
else
  echo "Must be root to install or uninstall the agent."
fi
