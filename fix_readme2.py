content = open('README.md').read()
old = "## What's real vs. what's a placeholder"
new = """## What's real vs. what's a placeholder

**Real, verified, working:** `verify_fixture` genuinely CPIs into TxLINE's own
on-chain `validate_fixture` instruction and succeeds on devnet - confirmed
transactions:
- https://explorer.solana.com/tx/4xcED6D9byrK2Vy94cQDLjE9X4WJewop9yA2ZJZuc4WfDMah5vYrQnx14xsb7MCNiU75cZ9RG2PkhkZq2ZZyXkwE?cluster=devnet
- https://explorer.solana.com/tx/3URxSxPY8oFvC9ngg3PYmNVUB2FBCfrbRcnCQv6BwPkTZcBDyEdeq2WLPv25Wh5rkB8ZYkV58nFkroXHkXS79CUR?cluster=devnet

This uses TxLINE's real IDL (github.com/txodds/tx-on-chain) and real Merkle
proofs fetched live from their devnet API."""
if old in content and "verify_fixture\` genuinely CPIs" not in content:
    content = content.replace(old, new)
    open('README.md', 'w').write(content)
    print('patched successfully')
else:
    print('already patched or pattern not found')
