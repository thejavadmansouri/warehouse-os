import os

# پوشه‌هایی که نباید اسکن شوند
EXCLUDE_DIRS = {
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    '.DS_Store'
}

# پسوندهایی که شاید نخواهید در لیست بیایند (اختیاری)
EXCLUDE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.ico', '.lock', '.pyc'}

def generate_file_tree(start_path='.', output_file='project_files.txt'):
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=== Project File Structure ===\n\n")
        
        for root, dirs, files in os.walk(start_path):
            # فیلتر کردن پوشه‌های اضافی به صورت درجا
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith('.')]
            
            # محاسبه عمق برای نمایش درختی
            relative_path = os.path.relpath(root, start_path)
            if relative_path == '.':
                level = 0
                path_display = "Root"
            else:
                level = relative_path.count(os.sep) + 1
                path_display = relative_path
                
            indent = '    ' * (level - 1) + '├── ' if level > 0 else ''
            f.write(f"{indent}[{path_display}]\n")
            
            sub_indent = '    ' * level + '├── '
            for file in sorted(files):
                if any(file.endswith(ext) for ext in EXCLUDE_EXTENSIONS):
                    continue
                f.write(f"{sub_indent}{file}\n")
                
    print(f"[+] File structure successfully saved to '{output_file}'")

if __name__ == '__main__':
    generate_file_tree()