import {
    defineProperties,
    Eip1193Provider,
    ethers,
    JsonRpcApiProvider, Networkish,
    Provider,
    TransactionRequest,
    TransactionResponse
} from "ethers";

import { TX_TYPE, WALLET_TYPES } from "./utils";
import log from "./utils/log";
import {JsonRpcSigner} from "ethers/lib.commonjs/providers/provider-jsonrpc";
import {Signer} from "ethers/lib.commonjs/providers/signer";
import { getAddress, resolveAddress } from "ethers/lib.commonjs/address/index.js";
import type { TransactionLike } from "ethers/lib.commonjs/transaction/index.js";
import type { TypedDataDomain, TypedDataField } from "ethers/lib.commonjs/hash/index.js";
import { TypedDataEncoder } from "ethers/lib.commonjs/hash/index.js";
import {
    getBigInt, hexlify, isHexString, toQuantity, toUtf8Bytes,
    isError, makeError, assert, assertArgument,
    FetchRequest, resolveProperties
} from "ethers/lib.commonjs/utils/index.js";
import {PolisProvider} from "./polisProvider";

const errorGas = [ "call", "estimateGas" ];
const Primitive = "bigint,boolean,function,number,string,symbol".split(/,/g);

function deepCopy<T = any>(value: T): T {
    if (value == null || Primitive.indexOf(typeof(value)) >= 0) {
        return value;
    }

    // Keep any Addressable
    if (typeof((<any>value).getAddress) === "function") {
        return value;
    }

    if (Array.isArray(value)) { return <any>(value.map(deepCopy)); }

    if (typeof(value) === "object") {
        return Object.keys(value).reduce((accum, key) => {
            accum[key] = (<any>value)[key];
            return accum;
        }, <any>{ });
    }

    throw new Error(`should not happen: ${ value } (${ typeof(value) })`);
}

function* incrementSequence(start = 0) {
    let count = start;
    while (true) {
        yield count++;
    }
}

export class NuvoWeb3Provider extends  ethers.BrowserProvider {

    polisProvider: PolisProvider;

    constructor(ethereum: Eip1193Provider,network?: Networkish) {
        super(ethereum, network);
        if(ethereum instanceof PolisProvider){
            this.polisProvider = ethereum;
        }
        this.#request = async (method: string, params: Array<any> | Record<string, any>) => {
            const payload = { method, params };
            this.emit("debug", { action: "sendEip1193Request", payload });
            try {
                const result = await ethereum.request(payload);
                this.emit("debug", { action: "receiveEip1193Result", result });
                return result;
            } catch (e: any) {
                const error = new Error(e.message);
                (<any>error).code = e.code;
                (<any>error).data = e.data;
                (<any>error).payload = payload;
                this.emit("debug", { action: "receiveEip1193Error", error });
                throw error;
            }
        };
    }

    #request: (method: string, params: Array<any> | Record<string, any>) => Promise<any>;

    async getSigner(address?: number | string): Promise<NuvoSinger> {
        // getSigner(addressOrIndex?: string | number):ethers.JsonRpcSigner {
        // return new NuvoSinger(this, address);
        if (address == null) { address = 0; }

        if (!(await this.hasSigner(address))) {
            try {
                //const resp =
                await this.#request("eth_requestAccounts", [ ]);

            } catch (error: any) {
                const payload = error.payload;
                throw this.getRpcError(payload, { id: payload.id, error });
            }
        }
        if (address == null) { address = 0; }

        const accountsPromise = this.send("eth_accounts", [ ]);

        // Account index
        if (typeof(address) === "number") {
            const accounts = <Array<string>>(await accountsPromise);
            if (address >= accounts.length) { throw new Error("no such account"); }
            return new NuvoSinger(this, accounts[address]);
        }

        const { accounts } = await resolveProperties({
            network: this.getNetwork(),
            accounts: accountsPromise
        });

        // Account address
        address = getAddress(address);
        for (const account of accounts) {
            if (getAddress(account) === address) {
                return new NuvoSinger(this, address);
            }
        }
        // return await super.getSigner(address);
        return new NuvoSinger(this, address);
    }
}

export class NuvoSinger  extends JsonRpcSigner {

    requestCount = incrementSequence(1);

    constructor(provider: JsonRpcApiProvider, address: string) {

        super(provider,address);
        address = getAddress(address);
        defineProperties<JsonRpcSigner>(this, { address });
    }

    polisProvider(): PolisProvider {
        if(this.provider instanceof NuvoWeb3Provider) {
            const nuvoWeb3Provider = this.provider as NuvoWeb3Provider;
            const polisProvider = nuvoWeb3Provider.polisProvider;
            return polisProvider;
        }else{
            throw new Error('Provider is not an instance of NuvoProvider');
        }
    }

    connect(provider: null | Provider): Signer {
        assert(false, "cannot reconnect JsonRpcSigner", "UNSUPPORTED_OPERATION", {
            operation: "signer.connect"
        });
    }

    async getAddress(): Promise<string> {
        return this.address;
    }

    // JSON-RPC will automatially fill in nonce, etc. so we just check from
    async populateTransaction(tx: TransactionRequest): Promise<TransactionLike<string>> {
        return await this.populateCall(tx);
    }

    // Returns just the hash of the transaction after sent, which is what
    // the bare JSON-RPC API does;
    async sendUncheckedTransaction(_tx: TransactionRequest): Promise<string> {
        const tx = deepCopy(_tx);

        const promises: Array<Promise<void>> = [];

        // Make sure the from matches the sender
        if (tx.from) {
            const _from = tx.from;
            promises.push((async () => {
                const from = await resolveAddress(_from, this.provider);
                assertArgument(from != null && from.toLowerCase() === this.address.toLowerCase(),
                    "from address mismatch", "transaction", _tx);
                tx.from = from;
            })());
        } else {
            tx.from = this.address;
        }

        // The JSON-RPC for eth_sendTransaction uses 90000 gas; if the user
        // wishes to use this, it is easy to specify explicitly, otherwise
        // we look it up for them.
        if (tx.gasLimit == null) {
            promises.push((async () => {
                tx.gasLimit = await this.provider.estimateGas({ ...tx, from: this.address});
            })());
        }

        // The address may be an ENS name or Addressable
        if (tx.to != null) {
            const _to = tx.to;
            promises.push((async () => {
                tx.to = await resolveAddress(_to, this.provider);
            })());
        }

        // Wait until all of our properties are filled in
        if (promises.length) { await Promise.all(promises); }

        const hexTx = this.provider.getRpcTransaction(tx);

        return this.provider.send("eth_sendTransaction", [ hexTx ]);
    }

    async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
        const polisProvider = this.polisProvider();
        const walletType = polisProvider.walletType;
        if(!walletType){
            const address = await this.getAddress();
        }
        let hash = "";
        let res:any = {}
        let req = {
            id:this.requestCount.next().value,
            'jsonrpc': '2.0',
            method: "eth_sendTransaction",
            params: [tx]
        }
        // alert(req);
        await polisProvider.confirmTrans(req,res);
        if(res.error){
            throw res.error;
        }
        hash = res.result;

        // This cannot be mined any earlier than any recent block
        const blockNumber = await this.provider.getBlockNumber();
        //
        // // Send the transaction
        // const hash = await this.sendUncheckedTransaction(tx);

        // Unfortunately, JSON-RPC only provides and opaque transaction hash
        // for a response, and we need the actual transaction, so we poll
        // for it; it should show up very quickly
        return await (new Promise((resolve, reject) => {
            const timeouts = [ 1000, 100 ];
            let invalids = 0;

            const checkTx = async () => {

                try {
                    // Try getting the transaction
                    const tx = await this.provider.getTransaction(hash);

                    if (tx != null) {
                        resolve(tx.replaceableTransaction(blockNumber));
                        return;
                    }

                } catch (error) {

                    // If we were cancelled: stop polling.
                    // If the data is bad: the node returns bad transactions
                    // If the network changed: calling again will also fail
                    // If unsupported: likely destroyed
                    if (isError(error, "CANCELLED") || isError(error, "BAD_DATA") ||
                        isError(error, "NETWORK_ERROR") || isError(error, "UNSUPPORTED_OPERATION")) {

                        if (error.info == null) { error.info = { }; }
                        error.info.sendTransactionHash = hash;

                        reject(error);
                        return;
                    }

                    // Stop-gap for misbehaving backends; see #4513
                    if (isError(error, "INVALID_ARGUMENT")) {
                        invalids++;
                        if (error.info == null) { error.info = { }; }
                        error.info.sendTransactionHash = hash;
                        if (invalids > 10) {
                            reject(error);
                            return;
                        }
                    }

                    // Notify anyone that cares; but we will try again, since
                    // it is likely an intermittent service error
                    this.provider.emit("error", makeError("failed to fetch transation after sending (will try again)", "UNKNOWN_ERROR", { error }));
                }

                // Wait another 4 seconds
                this.provider._setTimeout(() => { checkTx(); }, timeouts.pop() || 4000);
            };
            checkTx();
        }));
    }

    async signTransaction(_tx: TransactionRequest): Promise<string> {
        const tx = deepCopy(_tx);

        // Make sure the from matches the sender
        if (tx.from) {
            const from = await resolveAddress(tx.from, this.provider);
            assertArgument(from != null && from.toLowerCase() === this.address.toLowerCase(),
                "from address mismatch", "transaction", _tx);
            tx.from = from;
        } else {
            tx.from = this.address;
        }

        const hexTx = this.provider.getRpcTransaction(tx);
        return await this.provider.send("eth_signTransaction", [ hexTx ]);
    }


    async signMessage(_message: string | Uint8Array): Promise<string> {
        const message = ((typeof(_message) === "string") ? toUtf8Bytes(_message): _message);
        return await this.provider.send("personal_sign", [
            hexlify(message), this.address.toLowerCase() ]);
    }

    async signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, _value: Record<string, any>): Promise<string> {
        const value = deepCopy(_value);

        // Populate any ENS names (in-place)
        const populated = await TypedDataEncoder.resolveNames(domain, types, value, async (value: string) => {
            const address = await resolveAddress(value);
            assertArgument(address != null, "TypedData does not support null address", "value", value);
            return address;
        });

        return await this.provider.send("eth_signTypedData_v4", [
            this.address.toLowerCase(),
            JSON.stringify(TypedDataEncoder.getPayload(populated.domain, types, populated.value))
        ]);
    }

    async unlock(password: string): Promise<boolean> {
        return this.provider.send("personal_unlockAccount", [
            this.address.toLowerCase(), password, null ]);
    }

    // https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_sign
    async _legacySignMessage(_message: string | Uint8Array): Promise<string> {
        const message = ((typeof(_message) === "string") ? toUtf8Bytes(_message): _message);
        return await this.provider.send("eth_sign", [
            this.address.toLowerCase(), hexlify(message) ]);
    }

}
