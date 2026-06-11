<template>
  <div class="schedules-page">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>值班排班</h2>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          创建排班
        </el-button>
      </div>
    </div>

    <div class="card">
      <el-table :data="schedules" v-loading="loading" stripe>
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="row.type === 'fixed' ? 'primary' : 'success'">
              {{ row.type === 'fixed' ? '固定排班' : '轮转排班' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前值班" min-width="200">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="showOnCall(row)">
              查看
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="timezone" label="时区" width="120" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-switch
              :model-value="row.isEnabled"
              @change="(val) => toggleSchedule(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="editSchedule(row)">编辑</el-button>
            <el-button type="danger" size="small" @click="deleteSchedule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingSchedule ? '编辑排班' : '创建排班'" width="700px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="排班名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        
        <el-form-item label="排班类型" required>
          <el-radio-group v-model="form.type">
            <el-radio value="fixed">固定排班</el-radio>
            <el-radio value="rotation">轮转排班</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="时区">
          <el-select v-model="form.timezone" style="width: 200px">
            <el-option label="UTC+8 (北京)" value="Asia/Shanghai" />
            <el-option label="UTC+0 (格林威治)" value="UTC" />
            <el-option label="UTC-5 (纽约)" value="America/New_York" />
            <el-option label="UTC-8 (洛杉矶)" value="America/Los_Angeles" />
          </el-select>
        </el-form-item>
        
        <template v-if="form.type === 'fixed'">
          <el-form-item label="班次设置">
            <div
              v-for="(shift, index) in form.shifts"
              :key="index"
              class="shift-row mb-10"
            >
              <el-select v-model="shift.day" style="width: 100px">
                <el-option label="周一" :value="1" />
                <el-option label="周二" :value="2" />
                <el-option label="周三" :value="3" />
                <el-option label="周四" :value="4" />
                <el-option label="周五" :value="5" />
                <el-option label="周六" :value="6" />
                <el-option label="周日" :value="0" />
              </el-select>
              <el-time-picker
                v-model="shift.startTime"
                format="HH:mm"
                value-format="HH:mm"
                placeholder="开始时间"
                class="ml-10"
              />
              <span class="ml-10">-</span>
              <el-time-picker
                v-model="shift.endTime"
                format="HH:mm"
                value-format="HH:mm"
                placeholder="结束时间"
                class="ml-10"
              />
              <el-input
                v-model="shift.userIds"
                placeholder="用户ID,多个用逗号分隔"
                style="width: 200px"
                class="ml-10"
              />
              <el-button
                v-if="form.shifts.length > 1"
                type="danger"
                size="small"
                class="ml-10"
                @click="removeShift(index)"
              >
                删除
              </el-button>
            </div>
            <el-button type="success" size="small" @click="addShift">
              + 添加班次
            </el-button>
          </el-form-item>
        </template>
        
        <template v-else>
          <el-form-item label="轮转周期">
            <el-select v-model="form.rotations[0].period" style="width: 150px">
              <el-option label="每日" value="daily" />
              <el-option label="每周" value="weekly" />
            </el-select>
          </el-form-item>
          <el-form-item label="值班人员">
            <el-input
              v-model="rotationUsers"
              placeholder="用户ID,多个用逗号分隔"
              style="width: 300px"
            />
          </el-form-item>
        </template>
        
        <el-form-item label="节假日覆盖">
          <div
            v-for="(holiday, index) in form.holidays"
            :key="index"
            class="holiday-row mb-10"
          >
            <el-date-picker
              v-model="holiday.date"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 150px"
            />
            <el-input
              v-model="holiday.userIds"
              placeholder="用户ID,多个用逗号分隔"
              style="width: 250px"
              class="ml-10"
            />
            <el-button
              type="danger"
              size="small"
              class="ml-10"
              @click="removeHoliday(index)"
            >
              删除
            </el-button>
          </div>
          <el-button type="success" size="small" @click="addHoliday">
            + 添加节假日
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSchedule">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showOnCallDialog" title="当前值班" width="400px">
      <el-descriptions :column="1" border v-if="currentOnCall">
        <el-descriptions-item label="值班表">
          {{ currentOnCall.scheduleName }}
        </el-descriptions-item>
        <el-descriptions-item label="值班人员ID">
          <el-tag v-for="id in currentOnCall.userIds" :key="id" class="mr-5">
            {{ id }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="班次" v-if="currentOnCall.shift">
          周{{ ['日', '一', '二', '三', '四', '五', '六'][currentOnCall.shift.day] }}
          {{ currentOnCall.shift.startTime }} - {{ currentOnCall.shift.endTime }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { schedulesApi } from '@/services/apiEndpoints';
import { Plus } from '@element-plus/icons-vue';

const loading = ref(false);
const schedules = ref<any[]>([]);
const showCreateDialog = ref(false);
const showOnCallDialog = ref(false);
const editingSchedule = ref<any>(null);
const currentOnCall = ref<any>(null);
const rotationUsers = ref('');

const form = reactive<any>({
  name: '',
  type: 'fixed',
  timezone: 'Asia/Shanghai',
  shifts: [{ day: 1, startTime: '09:00', endTime: '18:00', userIds: '' }],
  rotations: [{ period: 'weekly', userIds: [], currentIndex: 0, lastRotation: new Date() }],
  holidays: [],
  isEnabled: true,
});

watch(() => form.type, () => {
  if (form.type === 'rotation') {
    form.rotations = [{ period: 'weekly', userIds: [], currentIndex: 0, lastRotation: new Date() }];
  }
});

function addShift() {
  form.shifts.push({ day: 1, startTime: '09:00', endTime: '18:00', userIds: '' });
}

function removeShift(index: number) {
  form.shifts.splice(index, 1);
}

function addHoliday() {
  form.holidays.push({ date: '', userIds: '' });
}

function removeHoliday(index: number) {
  form.holidays.splice(index, 1);
}

async function loadSchedules() {
  loading.value = true;
  try {
    const response = await schedulesApi.getSchedules();
    schedules.value = response.data;
  } catch (error) {
    console.error('Failed to load schedules:', error);
  } finally {
    loading.value = false;
  }
}

async function showOnCall(schedule: any) {
  try {
    const response = await schedulesApi.getCurrentOnCall(schedule.id);
    currentOnCall.value = response.data;
    showOnCallDialog.value = true;
  } catch (error) {
    console.error('Failed to load on-call info:', error);
  }
}

function editSchedule(schedule: any) {
  editingSchedule.value = schedule;
  form.name = schedule.name;
  form.type = schedule.type;
  form.timezone = schedule.timezone || 'Asia/Shanghai';
  form.shifts = schedule.shifts ? JSON.parse(JSON.stringify(schedule.shifts)) : [];
  form.rotations = schedule.rotations ? JSON.parse(JSON.stringify(schedule.rotations)) : [];
  form.holidays = schedule.holidays ? JSON.parse(JSON.stringify(schedule.holidays)) : [];
  form.isEnabled = schedule.isEnabled;
  
  if (form.type === 'rotation' && form.rotations.length > 0) {
    rotationUsers.value = form.rotations[0].userIds.join(',');
  }
  showCreateDialog.value = true;
}

async function toggleSchedule(schedule: any, isEnabled: boolean) {
  try {
    if (isEnabled) {
      await schedulesApi.enableSchedule(schedule.id);
    } else {
      await schedulesApi.disableSchedule(schedule.id);
    }
    ElMessage.success('排班状态已更新');
    loadSchedules();
  } catch (error) {
    console.error('Failed to toggle schedule:', error);
  }
}

async function saveSchedule() {
  if (!form.name) {
    ElMessage.warning('请填写排班名称');
    return;
  }

  const data: any = {
    name: form.name,
    type: form.type,
    timezone: form.timezone,
    isEnabled: form.isEnabled,
    holidays: form.holidays,
  };

  if (form.type === 'fixed') {
    data.shifts = form.shifts.map((s: any) => ({
      ...s,
      userIds: s.userIds.split(',').map((id: string) => id.trim()).filter(Boolean),
    }));
  } else {
    const userIds = rotationUsers.value.split(',').map(id => id.trim()).filter(Boolean);
    data.rotations = [{
      period: form.rotations[0].period,
      userIds,
      currentIndex: form.rotations[0].currentIndex || 0,
      lastRotation: form.rotations[0].lastRotation || new Date(),
    }];
  }

  try {
    if (editingSchedule.value) {
      await schedulesApi.updateSchedule(editingSchedule.value.id, data);
      ElMessage.success('排班已更新');
    } else {
      await schedulesApi.createSchedule(data);
      ElMessage.success('排班已创建');
    }
    
    showCreateDialog.value = false;
    resetForm();
    loadSchedules();
  } catch (error) {
    console.error('Failed to save schedule:', error);
  }
}

async function deleteSchedule(schedule: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除排班 "${schedule.name}" 吗?`,
      '删除确认',
      { type: 'warning' }
    );
    
    await schedulesApi.deleteSchedule(schedule.id);
    ElMessage.success('排班已删除');
    loadSchedules();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete schedule:', error);
    }
  }
}

function resetForm() {
  editingSchedule.value = null;
  rotationUsers.value = '';
  form.name = '';
  form.type = 'fixed';
  form.timezone = 'Asia/Shanghai';
  form.shifts = [{ day: 1, startTime: '09:00', endTime: '18:00', userIds: '' }];
  form.rotations = [{ period: 'weekly', userIds: [], currentIndex: 0, lastRotation: new Date() }];
  form.holidays = [];
  form.isEnabled = true;
}

onMounted(() => {
  loadSchedules();
});
</script>

<style scoped>
.schedules-page {
  padding: 0;
}

.page-header {
  margin-bottom: 20px;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.flex {
  display: flex;
}

.justify-between {
  justify-content: space-between;
}

.items-center {
  align-items: center;
}

.shift-row, .holiday-row {
  display: flex;
  align-items: center;
}

.ml-10 {
  margin-left: 10px;
}

.mb-10 {
  margin-bottom: 10px;
}

.mr-5 {
  margin-right: 5px;
}

h2 {
  margin: 0;
  font-size: 18px;
}
</style>
