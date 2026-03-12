from custom_classes import Calculator

calc = Calculator()
print("Current value:" + str(calc._current_val))

calc.add(10, 5)
calc.multiply(calc._current_val, 2)
calc.divide(calc._current_val, 3)

print("Result: " + str(calc._current_val))