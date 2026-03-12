class Calculator(object):
    def __init__(self):
        self._current_val = 0
        
    def subtract(self, x, y):
        self._current_val = x - y
        return self._current_val    