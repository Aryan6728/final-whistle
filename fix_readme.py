content = open('README.md').read()
old = "# Final Whistle — Anchor Program"
new = '<p align="center">\n  <img src="website/logo-readme.png" alt="Final Whistle" width="220">\n</p>\n\n# Final Whistle — Anchor Program'
if old in content and 'logo-readme.png' not in content:
    content = content.replace(old, new)
    open('README.md', 'w').write(content)
    print('patched successfully')
else:
    print('already patched or pattern not found')
