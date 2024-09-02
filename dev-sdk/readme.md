
# Nuvo  sdk

## Change log
- v1.2.0
  - support ethers6
- v1.1.41 
  - support bitget wallet

## Sdk install
```
npm install --save-dev @metis.io/middleware-client
```

To enable a user of a website/app to log into Nuvo and access its functionalities such as checking balance and sending transaction, follows these high level steps:

1. Acquire access token using Oauth2 client
2. Use the acquired access token to initialize a PolisProvider or PolisClient Object
3. Use the methods provided by PolisProvider or PolisClient to execute user's Nuvo account's functionalities.

First we use this code example to demostrate how to initialize an Oauth2 client and acquire an access token from a user's account:

# Oauth2 client

### import & create
```
    import { Oauth2Client } from '@metis.io/middleware-client'

    let oauth2Client = new Oauth2Client()
```

### start oauth
```javascript
/**
 * switchAccount = true:  Does not automatically log in,default:false
 * newWindow: default false
 */

oauth2Client.startOauth2(`APPID`, `RETURN URL`, `newWindow`,`switchAccount`); 
```
The `APPID` and `RETURN URL` can get from Polis Developer User page

### request access token & refresh token on RETURN URL page in backend
```
    get(`https://polis.metis.io/api/v1/oauth2/access_token?app_id=${this.appid}&app_key=${this.appsecret}&code=${this.code}`)

    // if success
    res => {
        if (res.status == 200 && res.data && res.data.code == 200) {
          // res.data.data.access_token
          // res.data.data.refresh_token
          // res.data.data.expires_in
        }
    }      
```

### refresh token
```
    const oauth2User = await oauth2Client.refreshTokenAsync(`APPID`, `RefreshToken`)
```

### get user info
```
    const userInfo = await oauth2Client.getUserInfoAsync(`AccessToken`)

    // user info struct {
        'display_name': '',
        'username': '',
        'email': '',
        'eth_address': '',
        'last_login_time': timestamp
    }
```

### oauth logout
```javascript
// refreshToken:options When refreshtoken is not empty, refreshtoken will also be deleted and cannot be used.
 logout(appId:string, accessToken:string, refreshToken:string="").then(res=>{
    //res = {
    //     status: 200 
    //     msg: ""
    // }
})
.catch(res=>{
    // res = {
    //     status: -90016
    //     msg: ""
    // }
})
```


-----

Once we acquired the access token, we can use either a PolisProvider object that is compatible with ethers provider, or a PolisClient object to access user account's functionalities. 


# 1、Use Ethers Web3Provider

## step 1  IPolisProviderOpts
```javascript

const opts: IPolisProviderOpts = {
            apiHost: 'https://api.nuvosphere.io/',  // api host
            oauthHost?: "", //oauth login host, options
            token?: {accessToken}, //optional oauth2 access token 
            chainId: 4,
        }
const polisprovider = new PolisProvider(opts)
```
## step 2 Ethers Web3 Provider
### ethers.js

```javascript
ethersProvider = new ethers.BrowserProvider(polisprovider)
```



# 2、 Use Polis Client

## step 1 
```javascript

const clientOps:IPolisClientOpts = {
    chainId: CHAIN_ID,
    appId:APP_ID,
    apiHost :apiHost
}
client = new PolisClient(clientOps);
client.web3Provider.getBalance("address")
/**
 * oauthInfo:  get from api: api/v1/oauth2/access_token or token string
 * 
 */
client.connect(oauthInfo);
// 1.1.17 later
await client.connect(oauthInfo);
```
### Polis Client Events
```javascript
//event of debug
 this.polisclient.on('debug', function (data) {
        console.log('debug data:%s', JSON.stringify(data));
 })
// event of error
this.polisclient.on('error', function (data) {
    console.log('error:', data instanceof Error)
});
//when metamask wallet
this.polisclient.on('chainChanged', (chainId) => {
    console.log('polis-client print chainId =>', chainId);
});
this.polisclient.on('accountsChanged', (account) => {
    console.log('polis-client print account =>', account);
});
```

## step 2  get Web3 Provider
```javascript
ethersProvider=client.web3Provider // ethers.BrowserProvider
//v1.2.0
var singer = await ethersProvider.getSinger();
//v1.1.x
var singer =  ethersProvider.getSinger();

singer.signMessage("aa");


const daiAddress = this.contract.address;

const daiAbi = [
    // Some details about the token
    "function name() view returns (string)",
    "function symbol() view returns (string)",

    // Get the account balance
    "function balanceOf(address) view returns (uint)",

    // Send some of your tokens to someone else
    "function transfer(address to, uint amount)",

    // An event triggered whenever anyone transfers to someone else
    "event Transfer(address indexed from, address indexed to, uint amount)"
];

// v1.2.0 later
const daiContract = await client.getContract(daiAddress, daiAbi);
//v1.1.x
const daiContract =  client.getContract(daiAddress, daiAbi);

await daiContract['name']();

```




