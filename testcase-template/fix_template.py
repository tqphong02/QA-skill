import zipfile
import re
import os

with zipfile.ZipFile('assets/Template.xlsx', 'r') as zin:
    with zipfile.ZipFile('assets/Template_fixed.xlsx', 'w') as zout:
        for item in zin.infolist():
            content = zin.read(item.filename)
            if item.filename.startswith('xl/worksheets/sheet'):
                # Replace semicolons with spaces inside sqref attributes
                content_str = content.decode('utf-8')
                def repl_sqref(match):
                    # Replace ; with space
                    sqrefs = match.group(1).replace(';', ' ')
                    return f'sqref="{sqrefs}"'
                content_str = re.sub(r'sqref="([^"]+)"', repl_sqref, content_str)
                content = content_str.encode('utf-8')
            zout.writestr(item, content)

os.replace('assets/Template_fixed.xlsx', 'assets/Template.xlsx')
print("Fixed template.")
