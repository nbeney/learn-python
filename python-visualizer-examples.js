// Examples for python-visualizer.html. Edit freely: each example has a title, code and (optional) stdin.
// Put the text between the backticks as-is (a leading newline is ignored). Avoid backticks and ${ inside code.
window.PV_EXAMPLES = {
  "Basics": [
    {
      title: "Variables and types",
      code: `
age = 12
name = "Zoe"
height = 1.55
is_kid = age < 18
nothing = None
age = age + 1
`
    },
    {
      title: "Loop and input",
      code: `
n = int(input("How many? "))
total = 0
for i in range(1, n + 1):
    total = total + i
print("Sum:", total)
`,
      stdin: `
4`
    },
  ],
  "Functions": [
    {
      title: "Factorial (recursion)",
      code: `
def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(4))
`
    },
    {
      title: "Default parameters",
      code: `
def add_item(item, basket=[], count=1):
    basket.append(item)
    return basket

print(add_item("apple"))
print(add_item("pear"))
`
    },
  ],
  "Data structures": [
    {
      title: "Lists and aliases",
      code: `
a = [1, 2, 3]
b = a
b.append(4)
c = list(a)
c.append(5)
print(a, b, c)
`
    },
    {
      title: "Grid (list of lists)",
      code: `
grid = [[0] * 3 for _ in range(3)]
for i in range(3):
    grid[i][i] = 1
print(grid)
`
    },
    {
      title: "Dictionary",
      code: `
ages = {"Ann": 10, "Bob": 12}
ages["Cy"] = 9
for k in ages:
    ages[k] += 1
print(ages)
`
    },
  ],
  "Classes": [
    {
      title: "Person class",
      code: `
class Person:
    def __init__(self, name):
        self.name = name
        self.friends = []

    def add_friend(self, other):
        self.friends.append(other)

ann = Person("Ann")
bob = Person("Bob")
ann.add_friend(bob)
`
    },
  ],
  "Errors": [
    {
      title: "ZeroDivisionError",
      code: `
def ratio(a, b):
    return a / b

print(ratio(6, 3))
print(ratio(1, 0))
`
    },
    {
      title: "Syntax error",
      code: `
x = 5
if x > 3
    print("big")
`
    },
  ],
  "Concepts": [
    {
      title: "All data types",
      code: `
# One variable per type, named <common case>_<type>

name_str = "Ada"
age_int = 12
height_float = 1.55
enabled_bool = True
nothing_none = None
signal_complex = 2 + 3j
basket_list = ["milk", "bread", "jam"]
point_tuple = (4, 5)
translation_dict = {"red": "rouge", "green": "vert", "blue": "bleu"}
fruit_set = {"apple", "banana"}
numbers_frozenset = frozenset([1, 2, 3])
data_bytes = b"hi"
buffer_bytearray = bytearray(b"hi")
span_range = range(3)

# Modules are objects
import math as math_module

# Functions are objects
def greet_function():
    pass

# Classes are objects too
class Person_class:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    def greet(self):
        print(f"Hi! My name is {self.name} and I am {self.age}.")

alice_object = Person_class("Alice", 20)
`
    },
    {
      title: "Variable scopes (LEGB)",
      code: `
# LEGB rule: Python looks a name up in this order:
#   L - Local      : inside the current function
#   E - Enclosing  : in outer functions (for nested functions)
#   G - Global     : at module level
#   B - Built-in   : len, print, range, ...
# Assigning to a name creates a LOCAL variable, unless it is
# declared with "global" or "nonlocal".

scope = "global"
counter = 0

def outer():
    scope = "enclosing" # a new local variable of outer()
    count = 0

    def inner():
        nonlocal count # use outer()'s count (Enclosing)
        global counter # use the module's counter (Global)
        scope = "local" # a new local variable of inner()
        count += 1
        counter += 10
        print(f"{scope = }, {counter = }, {count = }") # "local", 10, 1

    inner()
    print(f"{scope = }, {counter = }, {count = }") # "enclosing", 10, 1

outer()
print(f"{scope = }, {counter = }") # "global", 10
`
    },
  ],
};
