#!/bin/sh

code-push release-cordova blume-android android -m -t 1.0.x -d Production
code-push release-cordova blume-ios ios -m -t 1.0.x -d Production
echo Android:
code-push deployment ls blume-android
echo iOS:
code-push deployment ls blume-ios
