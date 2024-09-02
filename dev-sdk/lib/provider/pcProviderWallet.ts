import { ethers } from 'ethers';
import Swal from 'sweetalert2';
import errors, { toError } from './erros';
import log from "./utils/log"
import {TX_TYPE, WALLET_TYPES} from "./utils";
import html = Mocha.reporters.html;

const meta_storage_key = 'provider_address';
const chainIds = [1, 4,1088,59902, 435, 1337];

let isConnectedMetaMask: boolean = false;
let metaMaskNetworkStatus: boolean = false;
let env: string = 'prod';
// tslint:disable-next-line:prefer-const
let changedEventCall: any;

function getProvider(providerType:string=WALLET_TYPES.BITGET){
    if(providerType == WALLET_TYPES.BITGET)
        return  window.bitkeep.ethereum
    else
        return  window.ethereum;
}

function convert16(num: any) {
    // return '0x' + num.toString(16);
    return ethers.toQuantity(num);
    // return ethers.hexValue(num);
}

// success,error,warning,info,question
const MsgICON = {
    success:"success",
    error: "error",
    warning: "warning",
    info: "info",
    question:"question"
}
function showMsg(msg: string,html:string, iconStr: any = MsgICON.error) {
    const toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        },
    });

    toast.fire({
        icon: iconStr,
        title: msg ,
        html: html
    });
}

// get current chain id
export async function getCurChainId() {
    return await getProvider().request({method: 'eth_chainId'});
}

// add chain to Wallet
async function addChain(chainid: number, chain: any):Promise<any> {
    try {
        const ethChain = convert16(chainid);  //'0x' + chainid.toString(16);
        await getProvider().request({
            method: 'wallet_addEthereumChain',
            params: [{
                chainId: ethChain, chainName: chain.name,
                nativeCurrency: {
                    name: '',
                    symbol: chain.symbol, // 2-6 characters long
                    decimals: 18,
                },
                rpcUrls: [chain.url],
            }],
        });
        return true;
    } catch (addError: any) {
        // "Wallet Connect Error,Please try again.",
        return Promise.reject(toError(errors.MM_ERROR,addError.message));
    }
    return false;
}

export async function changeChain(chainid: number, chain: any) {
    // let chainid: number = 1337;
    const eth_chainid = "0x" + chainid.toString(16);
    try {
        await getProvider().request({
            method: 'wallet_switchEthereumChain',
            params: [{chainId: eth_chainid}],
        });
        return true;
    } catch (switchError: any) {
        // This error code indicates that the chain has not been added to Wallet.
        if (switchError.code === 4902 && chain != null) {
            const addRes = await addChain(chainid, chain);
            return addRes;
        }
    }
    return false;
}

export function addWalletEventCallback(eventName: string, callback: any) {
    if (!changedEventCall) {
        changedEventCall = Object.create(null);
    }
    if (callback == null) {
        delete changedEventCall[eventName];
    } else {
        if (!changedEventCall[eventName]) {
            changedEventCall[eventName] = callback;
        }
    }
}

export async function getMetaAccounts() {
    let metamaskAddress = '';
    if (!checkInstall()) {
        return Promise.reject(toError(errors.MM_ERROR,'MetaMask Not Install.'));

    } else {
        try {
            // when change chain
            getProvider().on('chainChanged', (chainId: any) => {
                // tslint:disable-next-line:radix
                const chainNum: any = window.parseInt(parseInt(chainId), 10);
                localStorage.setItem('metachain', chainNum);
                metaMaskNetworkStatus = chainIds.indexOf(chainNum) < 0;
                // notify client chain changed
                if (changedEventCall) {
                    const eventHandler = changedEventCall['chainChanged'];
                    eventHandler(chainId);
                }
            });
            // modify meta accou t
            getProvider().on('accountsChanged', (accounts: any) => {
                if (accounts.length > 0) {
                    metamaskAddress = accounts[0];
                    localStorage.setItem('meta_address', metamaskAddress);
                    // notify client account changed
                    if (changedEventCall) {
                        const eventHandler = changedEventCall['accountsChanged'];
                        eventHandler(metamaskAddress);
                    }
                }
            });

            const accounts = await getProvider().request({
                method: 'eth_requestAccounts',
            });
            // this.metaConnectStatus = accounts && accounts.length > 0;
            if (accounts.length > 0) {
                metamaskAddress = accounts[0];
                localStorage.setItem(meta_storage_key, metamaskAddress);
                isConnectedMetaMask = true;
            }
        } catch (e: any) {
            if (e.code === -32002) {
                return Promise.reject(toError(errors.MM_ERROR,'Already processing connecting wallet. Please open or unlock wallet .'));
            }
            else if (e.code === 4001) {
                return Promise.reject(errors.MM_SWITCH_CANCEL_CONNECT);
            }else {
                return Promise.reject(toError(errors.MM_ERROR,e.message));
            }
        }
        return metamaskAddress;
    }
}

/**
 *
 * @param trans
 * @param chain
 * @returns {Promise<any>}
 * {
    "hash": "0x806edb7151b9ebeaed92483ed2eb455ea2bca7608bd7926e4a7ba38257f83b3c",
    "type": 2,
    "accessList": null,
    "blockHash": null,
    "blockNumber": null,
    "transactionIndex": null,
    "confirmations": 0,
    "from": "0x507d2C5444Be42A5e7Bd599bc370977515B7353F",
    "gasPrice": {
        "type": "BigNumber",
        "hex": "0x596b8e48"
    },
    "maxPriorityFeePerGas": {
        "type": "BigNumber",
        "hex": "0x59682f00"
    },
    "maxFeePerGas": {
        "type": "BigNumber",
        "hex": "0x596b8e48"
    },
    "gasLimit": {
        "type": "BigNumber",
        "hex": "0x8703"
    },
    "to": "0x8E1De235c879ca7b6BDA3Df8c16E42f8eB1Da8d1",
    "value": {
        "type": "BigNumber",
        "hex": "0x00"
    },
    "nonce": 14,
    "data":"0xa9059cbb000000000000000000000000f1181bd15e8780b69a121a8d8946cc1c23
 */
export async function sendContractTx(trans: any, chain: any) {

    // return await this._sendMetaMaskTx(trans);
    const fromAddrees = trans.eth_address;
    let isok = true;
    // 1.check meta install
    const metaAddr: any = await getMetaAccounts();
    if (metaAddr === '') {
        //TODO not connect metamask
        return null;
    }
    // 2.check account
    if (fromAddrees.toLocaleLowerCase() !== metaAddr.toLocaleLowerCase().replaceAll('"', '')) {
        return {
            success: false,
            code: errors.MM_ACCOUNT_NOT_MATCH,
            data: `Invalid MetaMask address, it should be: ${fromAddrees}`
        };
    }
    // 3.check network
    const curMetaChain = await getCurChainId();
    if (trans.chainid !== curMetaChain) {
        isok = await changeChain(trans.chainid, chain);
    }
    if (!isok) {
        return {success: false, code: errors.MM_SWITCH_CHAIN_CANCEL, data: "chain is error "};
    }

    try {
        const provider = new ethers.BrowserProvider(getProvider());
        const signer = await provider.getSigner(trans.eth_address);
        const daiAddress = trans.contract_address;
        const daiAbi = [trans.func_abi_sign];
        // const daiAbi = ["function transfer(address to, uint amount)"];
        const contract = new ethers.Contract(daiAddress, daiAbi, signer);
        // const daiWithSigner:ethers.BaseContract = contract.connect(signer);
        // const txHash = await  contract[trans.function](trans.args);
        const overrides = {
            value: trans.value,
        };
        const metaTx = await contract[trans.function](...trans.args, overrides);
        const gasLimit = metaTx['gasLimit']['_hex'];
        const gasPrice = metaTx['gasPrice']['_hex'];
        const nonce = metaTx['nonce'];
        const txhash = metaTx['hash'];
        const metaFrom = metaTx['from'];
        const metaTo = metaTx['to'];
        const transRes = {
            chainid: trans.chainid,
            domain: trans.domain,
            from: metaFrom,
            to: metaTo,
            function: trans.function,
            args: trans.args,
            txType:TX_TYPE.SEND_CON_TX,
            trans: {
                gasLimit,
                gasPrice,
                txhash,
                nonce,
            },
        };
        // return {success: true, data: transRes};
        return Promise.resolve(transRes)
    } catch (e: any) {
        let errMsg = e.message;
        if (e.data) {
            errMsg += '|' + e.data.message;
        }
        return Promise.reject(errMsg)
    }
}

async function sendTrans(tx: {to: any,
    from: any,
    value: any,
    chainId: number,
    gas: number,
    gasPrice: number,
    data: string,
    nonce: number },chain: any
):Promise<any> {

    const from_addr = tx.from;
    let isok = false;
    // meta_addr = getStorage("meta_address");
    //1.check meta install
    const meta_addr: any = await getMetaAccounts();
    //2.check account
    if (
        from_addr.toLocaleLowerCase() !=
        meta_addr.toLocaleLowerCase().replaceAll('"', "")
    ) {
        return Promise.reject(toError(errors.MM_ACCOUNT_NOT_MATCH,`Invalid Wallet address, it should be: ${from_addr}`))
    }
    //3.check network
    isok = await changeChain(tx.chainId, chain);
    if (!isok) {
        return;
    }
    try {
        const provider = new ethers.BrowserProvider(getProvider());
        const signer = await provider.getSigner(from_addr);
        if(!tx.data && tx.data.length<=0){
            tx.data = "0x";
        }
        const transactionParameters = {
            nonce: tx.nonce, // ignored by Wallet
            gasPrice: convert16(tx.gasPrice), // customizable by user during Wallet confirmation.
            gasLimit: convert16(tx.gas), // customizable by user during Wallet confirmation.
            to: tx.to, // Required except during contract publications.
            from: tx.from, // must  match user's active address.
            value: convert16(tx.value), // Only required to send ether to the recipient from the initiating external account.
            data: tx.data, // Optional, but used for defining smart contract creation and interaction.
            chainId: tx.chainId // U
            // sed to prevent transaction reuse across blockchains. Auto-filled by Wallet.
        };
       const metaTx = await signer.sendTransaction(transactionParameters);
        const gasLimit = metaTx['gasLimit']; //['_hex'];
        const gasPrice =convert16(tx.gasPrice);
        const nonce = metaTx['nonce'];
        const txhash = metaTx['hash'];
        const metaFrom = metaTx['from'];
        const metaTo = metaTx['to'];
        
        const transRes = {
            chainId: tx.chainId,
            domain: '',
            from: metaFrom,
            to: metaTo,
            function: 'eth_sendTransaction',
            args: [tx.data],
            txType:'tx',
            tx:txhash,
            trans: {
                gasLimit,
                gasPrice,
                txhash,
                nonce,
            },
        };
        return Promise.resolve(transRes)
    } catch (e) {
        log.error("Wallet error",e);
        return Promise.reject(e)
    }
}

export async function isConnectedMeta() {
    const accounts = await getMetaAccounts();
    return !!accounts && accounts.length > 0;
}

export function getWalletAddress() {
    return localStorage.getItem(meta_storage_key);
}

export function setEnv(_env: string) {
    env = _env;
}

export async function addToken(token: any, tokenAddress: string, tokenDecimals: number, tokenImage: string, chainObj: any = null): Promise<any> {
    let symbol = '', address = '', decimals = 18, image = '', chain;
    if (typeof token === 'object') {
        symbol = token.token;
        address = token.tokenAddress;
        decimals = token.tokenDecimals;
        image = token.tokenImage;
    } else {
        symbol = token;
        address = tokenAddress;
        decimals = tokenDecimals;
        image = tokenImage;
    }
    if (chainObj || token['chainId']) {
        const curMetaChain = await getCurChainId();
        let chainChangeOk = true;
        if (convert16(chainObj.chainId) !== curMetaChain) {
            chainChangeOk = await changeChain(chainObj.chainId, chainObj);
        }
        if (!chainChangeOk) {
            return Promise.reject({success: false, code: errors.MM_SWITCH_CHAIN_CANCEL, data: 'chain change error '});
            // return ({ success: false, code: errData.MM_SWITCH_CHAIN_CANCEL, data: 'chain is error ' });
        }
    }
    // wasAdded is a boolean. Like any RPC method, an error may be thrown.
    return getProvider().request({
        method: 'wallet_watchAsset',
        params: {
            type: 'ERC20', // Initially only supports ERC20, but eventually more!
            options: {
                address,    // The address that the token is at.
                symbol,     // A ticker symbol or shorthand, up to 5 chars.
                decimals, // The number of decimals in the token
                image,       // A string url of the token logo
            },
        },
    });
}

export function checkInstall(walletType=WALLET_TYPES.BITGET){
    if (getProvider() == undefined) {
        showMsg( walletType + " wallet is not installed,Go to <a style='color:cornflowerblue' target='_blank' href='"+getWalletDownUrl(walletType)+"'>download and install</a>","");
        return false
    }
    return true;
}

function getWalletDownUrl(walletType=WALLET_TYPES.BITGET){
    if(walletType==WALLET_TYPES.BITGET)
        return "https://web3.bitget.com/en/wallet-download?type=1"
}

export async function signMessage(msg: string): Promise<any> {
    const meta_addr: any = await getMetaAccounts();
    try {

        const provider = new ethers.BrowserProvider(getProvider());
        
        const signer = await provider.getSigner();
        let msgBytes:any=null ;
        if(ethers.isHexString(msg)){
            msgBytes = ethers.getBytes(msg)
        }else{
            msgBytes = ethers.toUtf8Bytes(msg)
        }
        return signer.signMessage(msgBytes);
    } catch (e) {
        return Promise.reject(e);
    }
}

export default {
    getWalletAddress,
    isConnectedMeta,
    getMetaAccounts,
    getCurChainId,
    sendContractTx,
    sendTrans,
    changeChain,
    setEnv,
    addToken,
    checkInstall,
    signMessage,
    addWalletEventCallback,
};
