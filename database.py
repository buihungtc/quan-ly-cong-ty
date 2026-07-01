import sqlite3
import os
import sys
from datetime import datetime

# Lấy thư mục gốc lưu database tương thích với PyInstaller & Electron
if os.environ.get('APP_BASE_DIR'):
    BASE_DIR = os.environ.get('APP_BASE_DIR')
elif getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(BASE_DIR, 'contracts.db')


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Khởi tạo cơ sở dữ liệu và tạo bảng nếu chưa tồn tại"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_code TEXT UNIQUE,
            partner_name TEXT,
            value REAL,
            start_date TEXT,
            end_date TEXT,
            progress_notes TEXT,
            status TEXT NOT NULL DEFAULT 'processing',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS installments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            deadline_date TEXT,
            is_paid INTEGER DEFAULT 0,
            paid_date TEXT,
            FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contract_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            task_name TEXT NOT NULL,
            status_type INTEGER NOT NULL,
            target_date TEXT,
            is_completed INTEGER DEFAULT 0,
            completed_date TEXT,
            FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contract_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Gieo người dùng mặc định
    cursor.execute('SELECT COUNT(*) as count FROM users')
    if cursor.fetchone()['count'] == 0:
        cursor.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ('admin', 'admin', 'admin'))
        cursor.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ('guest', 'guest', 'guest'))

    # Gieo dữ liệu mặc định (Seeding)
    cursor.execute('SELECT COUNT(*) as count FROM contract_templates')
    count = cursor.fetchone()['count']
    if count == 0:
        import os
        templates_dir = os.path.join(BASE_DIR, 'templates_docs')
        
        # Mẫu thuê nhà mặc định
        thue_nha_text = ""
        filepath_thue_nha = os.path.join(templates_dir, 'hop_dong_thue_nha.txt')
        if os.path.exists(filepath_thue_nha):
            try:
                with open(filepath_thue_nha, 'r', encoding='utf-8') as f:
                    thue_nha_text = f.read()
            except Exception:
                pass
        if not thue_nha_text:
            thue_nha_text = "HỢP ĐỒNG THUÊ NHÀ\n\nBÊN CHO THUÊ (BÊN A): [Tên Bên A]\nBÊN THUÊ (BÊN B): [Tên Bên B]\n\nĐIỀU 1: ĐỐI TƯỢNG HỢP ĐỒNG\nĐịa chỉ: [Địa chỉ nhà thuê]\n\nĐIỀU 2: GIÁ THUÊ VÀ ĐẶC CỌC\nGiá thuê: [Giá thuê] VND/tháng.\nTiền đặt cọc: [Tiền đặt cọc] VND."

        # Mẫu dịch vụ mặc định
        dich_vu_text = ""
        filepath_dich_vu = os.path.join(templates_dir, 'hop_dong_dich_vu.txt')
        if os.path.exists(filepath_dich_vu):
            try:
                with open(filepath_dich_vu, 'r', encoding='utf-8') as f:
                    dich_vu_text = f.read()
            except Exception:
                pass
        if not dich_vu_text:
            dich_vu_text = "HỢP ĐỒNG CUNG CẤP DỊCH VỤ\n\nBÊN SỬ DỤNG DỊCH VỤ (BÊN A): [Tên Bên A]\nBÊN CUNG CẤP DỊCH VỤ (BÊN B): [Tên Bên B]\n\nĐIỀU 1: PHẠM VI DỊCH VỤ\n[Mô tả chi tiết công việc dịch vụ]\n\nĐIỀU 2: PHÍ DỊCH VỤ\nTổng phí: [Tổng phí dịch vụ] VND."

        cursor.execute('INSERT INTO contract_templates (name, content) VALUES (?, ?)', ("Hợp đồng thuê nhà mẫu", thue_nha_text))
        cursor.execute('INSERT INTO contract_templates (name, content) VALUES (?, ?)', ("Hợp đồng dịch vụ mẫu", dich_vu_text))

    # Khoi tao bang tai khoan ngan hang
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_name TEXT NOT NULL,
            account_number TEXT NOT NULL UNIQUE,
            account_holder TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    try:
        cursor.execute("ALTER TABLE contracts ADD COLUMN bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL")
    except sqlite3.OperationalError:
        pass

    # Don dep du lieu mo coi neu co
    cursor.execute("DELETE FROM installments WHERE contract_id NOT IN (SELECT id FROM contracts)")
    cursor.execute("DELETE FROM contract_tasks WHERE contract_id NOT IN (SELECT id FROM contracts)")

    conn.commit()
    conn.close()

def get_contracts(status=None):
    """Lấy danh sách hợp đồng, có thể lọc theo trạng thái"""
    conn = get_db_connection()
    cursor = conn.cursor()
    if status:
        cursor.execute('''
            SELECT c.*, b.bank_name, b.account_number, b.account_holder
            FROM contracts c
            LEFT JOIN bank_accounts b ON c.bank_account_id = b.id
            WHERE c.status = ?
            ORDER BY c.created_at DESC
        ''', (status,))
    else:
        cursor.execute('''
            SELECT c.*, b.bank_name, b.account_number, b.account_holder
            FROM contracts c
            LEFT JOIN bank_accounts b ON c.bank_account_id = b.id
            ORDER BY c.created_at DESC
        ''')
    rows = cursor.fetchall()
    
    contracts = [dict(row) for row in rows]
    for c in contracts:
        cursor.execute('SELECT * FROM installments WHERE contract_id = ? ORDER BY id ASC', (c['id'],))
        c['installments'] = [dict(i) for i in cursor.fetchall()]
        cursor.execute('SELECT * FROM contract_tasks WHERE contract_id = ? ORDER BY target_date ASC, id ASC', (c['id'],))
        c['tasks'] = [dict(t) for t in cursor.fetchall()]
        
    conn.close()
    return contracts

def get_contract_by_id(contract_id):
    """Lấy chi tiết hợp đồng theo ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.*, b.bank_name, b.account_number, b.account_holder
        FROM contracts c
        LEFT JOIN bank_accounts b ON c.bank_account_id = b.id
        WHERE c.id = ?
    ''', (contract_id,))
    row = cursor.fetchone()
    if row:
        contract = dict(row)
        cursor.execute('SELECT * FROM installments WHERE contract_id = ? ORDER BY id ASC', (contract_id,))
        contract['installments'] = [dict(i) for i in cursor.fetchall()]
        cursor.execute('SELECT * FROM contract_tasks WHERE contract_id = ? ORDER BY target_date ASC, id ASC', (contract_id,))
        contract['tasks'] = [dict(t) for t in cursor.fetchall()]
    else:
        contract = None
    conn.close()
    return contract

def add_contract(contract_code, partner_name, value, start_date, end_date, progress_notes, installments_data=None, tasks_data=None, bank_account_id=None):
    """Thêm hợp đồng mới kèm các đợt thanh toán và các nhiệm vụ checklist"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Nếu chưa ghi mã hợp đồng mà ghi tên đối tác -> tự tạo mã tạm thời
        if not contract_code:
            contract_code = f"HD-CHUA-KY-{datetime.now().strftime('%Y%m%d%H%M%S')}"

        cursor.execute('''
            INSERT INTO contracts (contract_code, partner_name, value, start_date, end_date, progress_notes, status, bank_account_id)
            VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)
        ''', (contract_code, partner_name, value, start_date, end_date, progress_notes, bank_account_id))
        contract_id = cursor.lastrowid
        
        # Thêm đợt thanh toán nếu có
        if installments_data:
            for inst in installments_data:
                amount = inst.get('amount', 0)
                deadline = inst.get('deadline_date', '')
                cursor.execute('''
                    INSERT INTO installments (contract_id, amount, deadline_date, is_paid)
                    VALUES (?, ?, ?, 0)
                ''', (contract_id, amount, deadline))
                
        # Kiểm tra điều kiện chỉ ghi tên đối tác (các thông tin khác trống) hoặc không có tasks gửi lên
        is_only_partner = partner_name and not start_date and not end_date and (not value or value == 0)

        # Thêm các công việc checklist
        if tasks_data:
            for t in tasks_data:
                t_name = t.get('task_name', '').strip()
                t_status = int(t.get('status_type', 1))
                t_date = t.get('target_date', '').strip()
                t_completed = 1 if t.get('is_completed') else 0
                t_comp_date = t.get('completed_date', None)
                cursor.execute('''
                    INSERT INTO contract_tasks (contract_id, task_name, status_type, target_date, is_completed, completed_date)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (contract_id, t_name, t_status, t_date, t_completed, t_comp_date))
        elif is_only_partner or (partner_name and not tasks_data):
            # Tự động kích hoạt trạng thái "chờ ký kết"
            today_str = datetime.now().strftime('%Y-%m-%d')
            cursor.execute('''
                INSERT INTO contract_tasks (contract_id, task_name, status_type, target_date, is_completed)
                VALUES (?, ?, ?, ?, 0)
            ''', (contract_id, f"Chờ ký kết hợp đồng với {partner_name}", 1, today_str))

        conn.commit()
        conn.close()
        return contract_id, None
    except sqlite3.IntegrityError as e:
        conn.close()
        if "UNIQUE constraint failed" in str(e):
            return None, "Mã hợp đồng đã tồn tại trong hệ thống."
        return None, str(e)
    except Exception as e:
        conn.close()
        return None, str(e)

def update_contract(contract_id, contract_code, partner_name, value, start_date, end_date, progress_notes, installments_data=None, tasks_data=None, bank_account_id=None):
    """Cập nhật toàn bộ thông tin hợp đồng kèm các đợt thanh toán và tasks"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            UPDATE contracts 
            SET contract_code = ?, partner_name = ?, value = ?, start_date = ?, end_date = ?, progress_notes = ?, bank_account_id = ?
            WHERE id = ?
        ''', (contract_code, partner_name, value, start_date, end_date, progress_notes, bank_account_id, contract_id))
        
        # Cập nhật đợt thanh toán
        if installments_data is not None:
            cursor.execute('SELECT id FROM installments WHERE contract_id = ?', (contract_id,))
            existing_ids = set(row['id'] for row in cursor.fetchall())
            
            incoming_ids = set()
            for inst in installments_data:
                inst_id = inst.get('id')
                amount = inst.get('amount', 0)
                deadline = inst.get('deadline_date', '')
                is_paid = 1 if inst.get('is_paid') else 0
                paid_date = inst.get('paid_date', None)
                
                if inst_id:
                    incoming_ids.add(int(inst_id))
                    cursor.execute('''
                        UPDATE installments
                        SET amount = ?, deadline_date = ?, is_paid = ?, paid_date = ?
                        WHERE id = ? AND contract_id = ?
                    ''', (amount, deadline, is_paid, paid_date, inst_id, contract_id))
                else:
                    cursor.execute('''
                        INSERT INTO installments (contract_id, amount, deadline_date, is_paid, paid_date)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (contract_id, amount, deadline, is_paid, paid_date))
                    
            ids_to_delete = existing_ids - incoming_ids
            for d_id in ids_to_delete:
                cursor.execute('DELETE FROM installments WHERE id = ? AND contract_id = ?', (d_id, contract_id))

        # Cập nhật tasks
        if tasks_data is not None:
            cursor.execute('SELECT id FROM contract_tasks WHERE contract_id = ?', (contract_id,))
            existing_task_ids = set(row['id'] for row in cursor.fetchall())
            
            incoming_task_ids = set()
            for t in tasks_data:
                t_id = t.get('id')
                t_name = t.get('task_name', '').strip()
                t_status = int(t.get('status_type', 1))
                t_date = t.get('target_date', '').strip()
                t_completed = 1 if t.get('is_completed') else 0
                t_comp_date = t.get('completed_date', None)
                
                if t_id:
                    incoming_task_ids.add(int(t_id))
                    cursor.execute('''
                        UPDATE contract_tasks
                        SET task_name = ?, status_type = ?, target_date = ?, is_completed = ?, completed_date = ?
                        WHERE id = ? AND contract_id = ?
                    ''', (t_name, t_status, t_date, t_completed, t_comp_date, t_id, contract_id))
                else:
                    cursor.execute('''
                        INSERT INTO contract_tasks (contract_id, task_name, status_type, target_date, is_completed, completed_date)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (contract_id, t_name, t_status, t_date, t_completed, t_comp_date))
                    
            tasks_to_delete = existing_task_ids - incoming_task_ids
            for d_id in tasks_to_delete:
                cursor.execute('DELETE FROM contract_tasks WHERE id = ? AND contract_id = ?', (d_id, contract_id))
                
        conn.commit()
        conn.close()
        return True, None
    except sqlite3.IntegrityError as e:
        conn.close()
        if "UNIQUE constraint failed" in str(e):
            return False, "Mã hợp đồng đã tồn tại trong hệ thống."
        return False, str(e)
    except Exception as e:
        conn.close()
        return False, str(e)

def update_progress_notes(contract_id, progress_notes):
    """Cập nhật ghi chú tiến độ của hợp đồng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE contracts SET progress_notes = ? WHERE id = ?', (progress_notes, contract_id))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def mark_contract_completed(contract_id):
    """Đánh dấu hoàn thành hợp đồng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE contracts SET status = 'completed' WHERE id = ?", (contract_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def revert_contract_status(contract_id):
    """Hoàn tác hợp đồng từ đã hoàn thành về đang xử lý"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE contracts SET status = 'processing' WHERE id = ?", (contract_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def delete_contract(contract_id):
    """Xóa hợp đồng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM contracts WHERE id = ?", (contract_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def get_statistics(bank_account_id=None):
    """Lấy các số liệu thống kê cho biểu đồ và báo cáo, có thể lọc theo tài khoản ngân hàng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Kiem tra xem co su dung bo loc tai khoan ngan hang khong
    has_filter = bank_account_id is not None and str(bank_account_id).strip() != ''
    filter_val = int(bank_account_id) if has_filter else None
    
    # 1. Tổng quan số lượng và giá trị theo từng trạng thái
    if has_filter:
        cursor.execute('''
            SELECT 
                status, 
                COUNT(*) as count, 
                SUM(value) as total_value 
            FROM contracts 
            WHERE bank_account_id = ?
            GROUP BY status
        ''', (filter_val,))
    else:
        cursor.execute('''
            SELECT 
                status, 
                COUNT(*) as count, 
                SUM(value) as total_value 
            FROM contracts 
            GROUP BY status
        ''')
    status_summary = {row['status']: {'count': row['count'], 'total_value': row['total_value'] or 0} for row in cursor.fetchall()}
    
    # Đảm bảo đủ các trạng thái trong cấu trúc
    for s in ['processing', 'completed']:
        if s not in status_summary:
            status_summary[s] = {'count': 0, 'total_value': 0}
            
    # 2. Hợp đồng trễ hạn (Đang xử lý và ngày kết thúc < ngày hiện tại)
    today_str = datetime.now().strftime('%Y-%m-%d')
    if has_filter:
        cursor.execute('''
            SELECT COUNT(*) as count, SUM(value) as total_value 
            FROM contracts 
            WHERE status = 'processing' AND end_date < ? AND bank_account_id = ?
        ''', (today_str, filter_val))
    else:
        cursor.execute('''
            SELECT COUNT(*) as count, SUM(value) as total_value 
            FROM contracts 
            WHERE status = 'processing' AND end_date < ?
        ''', (today_str,))
    overdue_row = cursor.fetchone()
    overdue_summary = {
        'count': overdue_row['count'] or 0,
        'total_value': overdue_row['total_value'] or 0
    }
    
    # 3. Phân bổ hợp đồng theo tháng (dựa trên start_date) - 12 tháng năm nay
    current_year = datetime.now().year
    if has_filter:
        cursor.execute('''
            SELECT strftime('%m', start_date) as month_num, COUNT(*) as count, SUM(value) as total_value
            FROM contracts
            WHERE strftime('%Y', start_date) = ? AND bank_account_id = ?
            GROUP BY month_num
            ORDER BY month_num ASC
        ''', (str(current_year), filter_val))
    else:
        cursor.execute('''
            SELECT strftime('%m', start_date) as month_num, COUNT(*) as count, SUM(value) as total_value
            FROM contracts
            WHERE strftime('%Y', start_date) = ?
            GROUP BY month_num
            ORDER BY month_num ASC
        ''', (str(current_year),))
    db_monthly = {row['month_num']: dict(row) for row in cursor.fetchall()}
    
    monthly_data = []
    for i in range(1, 13):
        m = f"{i:02d}"
        month_label = f"{current_year}-{m}"
        if m in db_monthly:
            monthly_data.append({
                'month': month_label,
                'count': db_monthly[m]['count'],
                'total_value': db_monthly[m]['total_value']
            })
        else:
            monthly_data.append({
                'month': month_label,
                'count': 0,
                'total_value': 0
            })
    
    # 4. Doanh thu thực tế (Tổng tiền các đợt đã thanh toán)
    if has_filter:
        cursor.execute('''
            SELECT SUM(i.amount) as actual_revenue 
            FROM installments i
            JOIN contracts c ON i.contract_id = c.id
            WHERE i.is_paid = 1 AND c.bank_account_id = ?
        ''', (filter_val,))
    else:
        cursor.execute('''
            SELECT SUM(i.amount) as actual_revenue 
            FROM installments i
            JOIN contracts c ON i.contract_id = c.id
            WHERE i.is_paid = 1
        ''')
    actual_revenue_row = cursor.fetchone()
    actual_revenue = actual_revenue_row['actual_revenue'] or 0
    
    # 4.5 Doanh thu chưa nhận được (Tổng tiền các đợt chưa thanh toán)
    if has_filter:
        cursor.execute('''
            SELECT SUM(i.amount) as unreceived_revenue 
            FROM installments i
            JOIN contracts c ON i.contract_id = c.id
            WHERE (i.is_paid = 0 OR i.is_paid IS NULL) AND c.bank_account_id = ?
        ''', (filter_val,))
    else:
        cursor.execute('''
            SELECT SUM(i.amount) as unreceived_revenue 
            FROM installments i
            JOIN contracts c ON i.contract_id = c.id
            WHERE i.is_paid = 0 OR i.is_paid IS NULL
        ''')
    unreceived_revenue_row = cursor.fetchone()
    unreceived_revenue = unreceived_revenue_row['unreceived_revenue'] or 0
    
    # 5. Danh sách hợp đồng đang thực hiện (Ngắn gọn)
    if has_filter:
        cursor.execute('''
            SELECT c.contract_code, c.partner_name, c.value, c.progress_notes,
                   (c.value - COALESCE((SELECT SUM(amount) FROM installments WHERE contract_id = c.id AND is_paid = 1), 0)) as remaining_value
            FROM contracts c
            WHERE c.status = 'processing' AND c.bank_account_id = ?
            ORDER BY c.created_at DESC
        ''', (filter_val,))
    else:
        cursor.execute('''
            SELECT c.contract_code, c.partner_name, c.value, c.progress_notes,
                   (c.value - COALESCE((SELECT SUM(amount) FROM installments WHERE contract_id = c.id AND is_paid = 1), 0)) as remaining_value
            FROM contracts c
            WHERE c.status = 'processing'
            ORDER BY c.created_at DESC
        ''')
    executing_contracts = [dict(row) for row in cursor.fetchall()]
 
    # 6. Doanh thu theo tháng (dựa trên ngày thanh toán)
    if has_filter:
        cursor.execute('''
            SELECT strftime('%Y-%m', i.paid_date) as month, SUM(i.amount) as revenue
            FROM installments i
            JOIN contracts c ON i.contract_id = c.id
            WHERE i.is_paid = 1 AND i.paid_date IS NOT NULL AND i.paid_date != '' AND c.bank_account_id = ?
            GROUP BY month
            ORDER BY month ASC
            LIMIT 12
        ''', (filter_val,))
    else:
        cursor.execute('''
            SELECT strftime('%Y-%m', i.paid_date) as month, SUM(i.amount) as revenue
            FROM installments i
            JOIN contracts c ON i.contract_id = c.id
            WHERE i.is_paid = 1 AND i.paid_date IS NOT NULL AND i.paid_date != ''
            GROUP BY month
            ORDER BY month ASC
            LIMIT 12
        ''')
    revenue_monthly = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    # Tính toán tổng hợp
    total_count = status_summary['processing']['count'] + status_summary['completed']['count']
    total_value = status_summary['processing']['total_value'] + status_summary['completed']['total_value']
    
    return {
        'total': {
            'count': total_count,
            'value': total_value,
            'actual_revenue': actual_revenue,
            'unreceived_revenue': unreceived_revenue
        },
        'processing': status_summary['processing'],
        'completed': status_summary['completed'],
        'overdue': overdue_summary,
        'monthly': monthly_data,
        'executing_contracts': executing_contracts,
        'revenue_monthly': revenue_monthly
    }

def update_task_status(task_id, is_completed, completed_date=None):
    """Cập nhật trạng thái hoàn thành của một công việc"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE contract_tasks 
        SET is_completed = ?, completed_date = ? 
        WHERE id = ?
    ''', (1 if is_completed else 0, completed_date if is_completed else None, task_id))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def get_templates():
    """Lấy danh sách các mẫu hợp đồng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM contract_templates ORDER BY id ASC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_template_by_id(template_id):
    """Lấy chi tiết một mẫu hợp đồng theo ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM contract_templates WHERE id = ?', (template_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def add_template(name, content):
    """Thêm mới một mẫu hợp đồng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO contract_templates (name, content) VALUES (?, ?)', (name, content))
        template_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return template_id, None
    except sqlite3.IntegrityError as e:
        conn.close()
        if "UNIQUE constraint failed" in str(e):
            return None, "Tên mẫu hợp đồng đã tồn tại."
        return None, str(e)
    except Exception as e:
        conn.close()
        return None, str(e)

def update_template(template_id, name, content):
    """Cập nhật một mẫu hợp đồng đã có"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('UPDATE contract_templates SET name = ?, content = ? WHERE id = ?', (name, content, template_id))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        return affected > 0, None
    except sqlite3.IntegrityError as e:
        conn.close()
        if "UNIQUE constraint failed" in str(e):
            return False, "Tên mẫu hợp đồng đã tồn tại."
        return False, str(e)
    except Exception as e:
        conn.close()
        return False, str(e)

def delete_template(template_id):
    """Xóa mẫu hợp đồng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM contract_templates WHERE id = ?', (template_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def verify_user(username, password):
    """Xác thực thông tin đăng nhập của người dùng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT username, role FROM users WHERE username = ? AND password = ?', (username, password))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def generate_token(username, role):
    """Tạo token phiên đăng nhập và lưu vào cơ sở dữ liệu"""
    import uuid
    token = uuid.uuid4().hex
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO user_sessions (token, username, role) VALUES (?, ?, ?)', (token, username, role))
    conn.commit()
    conn.close()
    return token

def verify_session(token):
    """Kiểm tra token phiên đăng nhập có hợp lệ không"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT username, role FROM user_sessions WHERE token = ?', (token,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_session(token):
    """Xóa token phiên đăng nhập khi đăng xuất"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM user_sessions WHERE token = ?', (token,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def update_user_password(username, new_password):
    """Cập nhật mật khẩu cho một tài khoản"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET password = ? WHERE username = ?', (new_password, username))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def create_guest_user(username, password):
    """Tạo tài khoản khách mới (Chỉ dành cho Admin)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', (username, password, 'guest'))
        conn.commit()
        conn.close()
        return True, None
    except sqlite3.IntegrityError:
        conn.close()
        return False, "Tên tài khoản khách đã tồn tại."
    except Exception as e:
        conn.close()
        return False, str(e)

def get_guest_users():
    """Lấy danh sách các tài khoản khách (Chỉ dành cho Admin)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT username, role FROM users WHERE role = 'guest' ORDER BY username ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def delete_guest_user(username):
    """Xóa tài khoản khách (Chỉ dành cho Admin)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE username = ? AND role = 'guest'", (username,))
    # Xóa cả session của tài khoản này
    cursor.execute("DELETE FROM user_sessions WHERE username = ?", (username,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

def get_bank_accounts():
    """Lấy danh sách tất cả các tài khoản ngân hàng thụ hưởng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bank_accounts ORDER BY bank_name ASC, account_number ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_bank_account_by_id(bank_account_id):
    """Lấy thông tin tài khoản ngân hàng theo ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bank_accounts WHERE id = ?", (bank_account_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def add_bank_account(bank_name, account_number, account_holder, description=None):
    """Thêm tài khoản ngân hàng thụ hưởng mới"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO bank_accounts (bank_name, account_number, account_holder, description)
            VALUES (?, ?, ?, ?)
        ''', (bank_name, account_number, account_holder, description))
        account_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return account_id, None
    except sqlite3.IntegrityError:
        conn.close()
        return None, "Số tài khoản ngân hàng này đã tồn tại."
    except Exception as e:
        conn.close()
        return None, str(e)

def update_bank_account(bank_account_id, bank_name, account_number, account_holder, description=None):
    """Cập nhật thông tin tài khoản ngân hàng thụ hưởng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            UPDATE bank_accounts
            SET bank_name = ?, account_number = ?, account_holder = ?, description = ?
            WHERE id = ?
        ''', (bank_name, account_number, account_holder, description, bank_account_id))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        return affected > 0, None
    except sqlite3.IntegrityError:
        conn.close()
        return False, "Số tài khoản ngân hàng này đã tồn tại."
    except Exception as e:
        conn.close()
        return False, str(e)

def delete_bank_account(bank_account_id):
    """Xóa tài khoản ngân hàng thụ hưởng"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM bank_accounts WHERE id = ?", (bank_account_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0

