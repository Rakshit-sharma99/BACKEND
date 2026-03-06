import os

root_dir = '/Users/amartyasingh/Downloads/GitHub/multiverse-backend'
new_uri = 'mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0'

def update_env_files():
    for subdir, _, files in os.walk(root_dir):
        for file in files:
            if file == '.env':
                filepath = os.path.join(subdir, file)
                updated_lines = []
                changed = False
                with open(filepath, 'r') as f:
                    lines = f.readlines()
                
                for line in lines:
                    if line.startswith('CLUSTER_URI='):
                        updated_lines.append(f'CLUSTER_URI={new_uri}\n')
                        changed = True
                    elif line.startswith('MONGO_URI='):
                        updated_lines.append(f'MONGO_URI={new_uri}\n')
                        changed = True
                    elif line.startswith('# MONGO_URI='):
                        updated_lines.append(f'# MONGO_URI={new_uri}\n')
                        changed = True
                    elif line.startswith('# MONGO_URI ='):
                        updated_lines.append(f'# MONGO_URI = {new_uri}\n')
                        changed = True
                    else:
                        updated_lines.append(line)
                        
                if changed:
                    with open(filepath, 'w') as f:
                        f.writelines(updated_lines)
                    print(f'Updated {filepath}')

if __name__ == '__main__':
    update_env_files()
