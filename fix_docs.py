content = open('docs.md').read()
old = '- Live site / devnet program: _add link_'
new = '- Deployed program (devnet): GmpCe863ZJD1WrbPAg1Di3Bgfg7CGaR1NGGyBJejMWji\n  https://explorer.solana.com/address/GmpCe863ZJD1WrbPAg1Di3Bgfg7CGaR1NGGyBJejMWji?cluster=devnet'
if old in content:
    content = content.replace(old, new)
    open('docs.md', 'w').write(content)
    print('patched successfully')
else:
    print('pattern not found')
