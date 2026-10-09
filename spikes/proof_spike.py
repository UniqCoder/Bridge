"""Spike: can Ganache eth_getProof + py-trie prove a SourceBridge deposit slot is empty / set?"""
import json, shutil, subprocess, sys, time
from pathlib import Path
ROOT = Path(sys.argv[1]); sys.path.insert(0, str(ROOT))
import rlp
from eth_abi import encode
from eth_account import Account
from eth_utils import keccak
from trie import HexaryTrie
from bridgewitness.evm import RPC, calldata
from bridgewitness.proofs import header_bytes, data

contracts = json.loads((ROOT/"artifacts/contracts.json").read_text())["contracts"]
g = Account.create()
p = subprocess.Popen([shutil.which("node"), str(ROOT/"node_modules/ganache/dist/node/cli.js"), "--server.port","8599",
    "--chain.chainId","31337","--chain.hardfork","shanghai","--logging.quiet","--wallet.accounts", "0x"+g.key.hex()+",1000000000000000000000"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(100):
        try: rpc = RPC("http://127.0.0.1:8599", 31337); break
        except Exception: time.sleep(.2)
    dep = lambda name, t=None, v=None: rpc.transact(g, payload="0x"+contracts[name]["evm"]["bytecode"]["object"]+encode(t or [], v or []).hex())["contractAddress"]
    tok = dep("DemoToken", ["string","uint8"], ["T", 6]); br = dep("SourceBridge")
    rpc.transact(g, tok, calldata("mint(address,uint256)", ["address","uint256"], [g.address, 10**9]))
    rpc.transact(g, tok, calldata("approve(address,uint256)", ["address","uint256"], [br, 10**9]))
    rid = keccak(text="r")
    def slot(msg): return keccak(encode(["bytes32","uint256"], [keccak(encode(["bytes32","bytes32"], [rid, msg])), 0]))
    good, bad = keccak(text="deposited"), keccak(text="never")
    rpc.transact(g, br, calldata("authorize(bytes32,bytes32,address,uint256,address,uint256)",
        ["bytes32","bytes32","address","uint256","address","uint256"], [rid, good, tok, 5, g.address, 31338]))
    head = rpc.call("eth_getBlockByNumber", ["latest", False]); header_bytes(head)
    pr = rpc.call("eth_getProof", [br, ["0x"+slot(good).hex(), "0x"+slot(bad).hex()], head["number"]])
    acct = HexaryTrie.get_from_proof(data(head["stateRoot"],32), keccak(data(br,20)), [rlp.decode(data(n)) for n in pr["accountProof"]])
    nonce, bal, sroot, chash = rlp.decode(acct)
    assert "0x"+sroot.hex() == pr["storageHash"].lower(), "storage root mismatch"
    for sp, name in zip(pr["storageProof"], ["deposited","never"]):
        v = HexaryTrie.get_from_proof(sroot, keccak(data(sp["key"] if len(sp["key"])==66 else "0x"+sp["key"][2:].rjust(64,"0"),32)), [rlp.decode(data(n)) for n in sp["proof"]])
        print(name, "-> slot value", rlp.decode(v) if v else b"", "(empty => exclusion proven)" if not v else "")
    print("PASS: account + storage proofs verified against header stateRoot", head["stateRoot"])
finally:
    p.terminate()
