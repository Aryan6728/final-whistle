content = open('docs.md').read()
old = '- Repo: _add link_'
new = '- Repo: https://github.com/Aryan6728/final-whistle'
if old in content:
    content = content.replace(old, new)
    open('docs.md', 'w').write(content)
    print('patched successfully')
else:
    print('pattern not found')
