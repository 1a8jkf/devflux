#!/bin/bash
export PATH=~/.local/bin:"$PATH"
cd /home/marcos/DevFlux/android
export ANDROID_HOME=/home/marcos/Android/Sdk
./gradlew assembleRelease
