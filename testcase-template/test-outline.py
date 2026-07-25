import openpyxl
wb = openpyxl.load_workbook('test-output_25-07-2026.xlsx')
ws = wb['Test cases_App']
for r in range(10, ws.max_row + 1):
    c3 = ws.cell(row=r, column=3).value
    c2 = ws.cell(row=r, column=2).value
    if r not in ws.row_dimensions:
        ws.row_dimensions[r] = openpyxl.worksheet.dimensions.RowDimension(ws, index=r)
    ws.row_dimensions[r].hidden = False
    
    if c3 and str(c3).startswith(('1.1', '1.2', '1.3')):
        ws.row_dimensions[r].outlineLevel = 0
    elif c3 and not c2:
        ws.row_dimensions[r].outlineLevel = 1
    elif c2:
        ws.row_dimensions[r].outlineLevel = 2
    else:
        ws.row_dimensions[r].outlineLevel = 0

wb.save('test-output-fixed.xlsx')
print("Done")
