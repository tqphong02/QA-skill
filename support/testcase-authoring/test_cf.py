import openpyxl
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import PatternFill, Font

wb = openpyxl.Workbook()
ws = wb.active

green_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
green_font = Font(color="006100")
rule = CellIsRule(operator='equal', formula=['"Pass"'], fill=green_fill, font=green_font)
ws.conditional_formatting.add("A1:A10", rule)

wb.save("test_cf.xlsx")
print("Done")
