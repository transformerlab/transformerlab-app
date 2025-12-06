import ast
import os

DB_PATH = os.path.join(os.getcwd(), "transformerlab", "db.py")
print(DB_PATH)  # For debugging purposes, can be removed later


def get_methods_with_unconverted_decorator(filepath):
    with open(filepath) as f:
        tree = ast.parse(f.read(), filename=filepath)
    methods = []
    unconverted_methods = []

    def handle_function(node, class_name=None):
        func_name = node.name
        methods.append((class_name, func_name))
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Name) and decorator.id == "unconverted":
                unconverted_methods.append((class_name, func_name))
            elif isinstance(decorator, ast.Attribute) and decorator.attr == "unconverted":
                unconverted_methods.append((class_name, func_name))

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            handle_function(node)
        elif isinstance(node, ast.ClassDef):
            class_name = node.name
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    handle_function(item, class_name)

    return methods, unconverted_methods


def main():
    methods, unconverted_methods = get_methods_with_unconverted_decorator(DB_PATH)
    total = len(methods)
    unconverted = len(unconverted_methods)
    converted = total - unconverted
    percent_converted = (converted / total * 100) if total else 0

    print(f"Total methods: {total}")
    print(f"Converted methods: {converted} ({percent_converted:.2f}%)")
    print(f"Unconverted methods: {unconverted} ({100 - percent_converted:.2f}%)")
    print("\nUnconverted methods:")
    for class_name, method_name in unconverted_methods:
        if class_name:
            print(f"  {class_name}.{method_name}")
        else:
            print(f"  {method_name}")


if __name__ == "__main__":
    main()
