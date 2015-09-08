# Universal-Link-Validator
A simple node app for testing your Apple App Site Association file setup.

[Check out the example instance running on Heroku](https://limitless-sierra-4673.herokuapp.com/).

### Why?
Apple doesn't provide any tool to validate your domain, similiar to the [Facebook Debugger](https://developers.facebook.com/tools/debug/) that I find super helpful, so the whole process becomes a complete black box to the end user. If you check device logs, you can see some messages about the failure when you install the app, but they're not really helpful in any way.

I decided to take a bit of time to put this together as a quick and easy way to quickly validate a domain (or an IPA file, checking the Info.plist) against some of the requirements I've been able to find across Apple's various documentation sources around this feature.

### Sources
[Shared Web Credentials](https://developer.apple.com/library/ios/documentation/Security/Reference/SharedWebCredentialsRef/) provides the majority of requirements .
  * The exact format of the constructed url is `https://domain[:port]/apple-app-site-association`.
  * The file must be hosted on an https:// site with a valid certificate.
  * The file must not use any redirects.
  * The file must have the MIME type `application/pkcs7-mime`.
  * The file must be CMS signed by a valid TLS certificate.

[App Search Programming](https://developer.apple.com/library/prerelease/ios/documentation/General/Conceptual/AppSearch/UniversalLinks.html#//apple_ref/doc/uid/TP40016308-CH12) provides the expected format for UL specifically. I'm not currently validating this, but it would be an easy and useful add, as typos here would be a simple miss (things like typing the Team or Bundle ID wrong).
