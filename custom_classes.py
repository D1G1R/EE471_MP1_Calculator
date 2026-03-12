class Calculator(object):
    def __init__(self):
        self._current_val = 0
        
    def divide(self, x, y):
        if y == 0:
            raise ValueError("Can not divide by 0!")
        self._current_val = x / y
        return self._current_val