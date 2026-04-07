import time

def genesis_time(advance_seconds=100):
    now = int(time.time())
    print(now)
    future = now + advance_seconds

    # print("Current Unix Time :", now)
    # print("Genesis Time      :", future)
    # print("Advance (seconds) :", advance_seconds)
    # print()
    print("Put this in genesis.json:")
    print(f'"genesisTime": {future},')

# Change this to however many seconds you want to delay launch

genesis_time(advance_seconds=30)

# need to continue with the fix suggested by gork

# ./ingrion.exe -forceGenesis=true -genesis genesis.json -p2p 127.0.0.1:3001 -publicAddr 127.0.0.1:3001 -rpc 127.0.0.1:4001 -peers config_peers.json -priv 3790919d10cfa2eb41e7b68d033495e67339b8669e5e9a74b2a3b68e1a312ac1 -data ingrion-1 -apikey kiransuryakumar
