class Calculator(object):
    def __init__(self):
        self._current_val = 0
        
    def divide(self, x, y):
        if y == 0:
            raise ValueError("Can not divide by 0!")
        self._current_val = x / y
        return self._current_val
    def add(self, x, y):
        self._current_val = x + y
        return self._current_val
    
    def subtract(self, x, y):
        self._current_val = x - y
        return self._current_val  
     
    def multiply(self, x, y):
        self._current_val = x * y
        return self._current_val