#!/bin/bash

UPDATE_DIR=/home/pi/nervbox_new
LIVE_DIR=/home/pi/nervbox
OLD_DIR=/home/pi/nervbox_old

echo -e "$(date -Iseconds) : checking for Nervbox updates to be install"

if [ -d "$UPDATE_DIR" ]
then
  echo -e "$(date -Iseconds) : update folder exist"
  
  echo -e "$(date -Iseconds) : copy config to update folder"
  cp $LIVE_DIR/appsettings* $UPDATE_DIR
  
  echo -e "$(date -Iseconds) : stopping nervbox deamon"
  sudo systemctl stop nervbox
  
  echo -e "$(date -Iseconds) : switching versions"
  rm -R $OLD_DIR  
  mv $LIVE_DIR $OLD_DIR
  mv $UPDATE_DIR $LIVE_DIR

  echo -e "$(date -Iseconds) : make new version executable"
  sudo chmod +x $LIVE_DIR/NervboxDeamon
  
  echo -e "$(date -Iseconds) : restart nervbox deamon"
  sudo systemctl start nervbox  
  
else
  echo -e "$(date -Iseconds) : no update found"
fi

if (systemctl -q is-active nervbox)
	then
	echo "$(date -Iseconds) : Nervbox deamon is running!"
fi   

