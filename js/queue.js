// cr@mega.co.nz
var DEFAULT_CONCURRENCY = 4

function MegaQueue(worker, limit) {
    this._limit = limit || 5;
	this._queue = [];
    this._running = 0
	this._worker  = worker
	this._noTaskCount = 0;
	this._qpaused = {};
}
inherits(MegaQueue, MegaEvents)

MegaQueue.prototype.isEmpty = function() {
	return this._running == 0 
		&& this._queue.length == 0
}

MegaQueue.prototype.pushFirst = function(arg, next, self) {
	if (d) {
		var found;
		for(var i in this._queue) {
			if(this._queue[i][0] == arg) {
				found = true;
				break;
			}
		}
		ASSERT(!found, 'Huh, that task already exists');
	}
	this._queue.unshift([arg, next, self]);
	this._process();
};

MegaQueue.prototype.resume = function() {
	this._paused = false;
	this._process();
	this.trigger('resume')
};

MegaQueue.prototype.canExpand = function() {
	return this._limit <= this._running && this._limit*1.5 >= this._running;
}

/**
 * Expand temporarily the queue size, it should be called
 * when a task is about to end (for sure) so a new
 * task can start.
 *
 * It is useful when download many tiny files
 */
MegaQueue.prototype.expand = function() {
	if (this.canExpand()) {
		this._expanded = true;
		this._process();
		if (d) console.log("expand queue " + this._running);
		return true;
	}
	return false;
};

MegaQueue.prototype.shrink = function() {
	this._limit = Math.max(this._limit-1, 1);
	if (d) console.error("shrking queue to ", this._limit);
	return this._limit;
}

MegaQueue.prototype.filter = function(key, value, memb)
{
	var len = this._queue.length;

	if (!len)
	{
		if (d) console.error('Nothing to filter');
	}
	else
	{
		if (typeof key === 'object')
		{
			if ("zipid" in key || "id" in key)
			{
				memb  = 'dl';
				value = key.zipid ? key.zipid:key.id;
				key   = key.zipid ? 'zipid':'id';
			}
			else
			{
				throw new Error('Unknown object.');
			}
		}

		this._queue = this._queue.filter(function(item)
		{
			var obj = item[0];

			if (typeof obj === 'object')
			{
				if ((memb && obj[memb] && obj[memb][key] == value)
				|| (!memb && obj[key] === value))
				{
					if (d && !obj.destroy) console.log('Removing Task ' + obj);
					if (obj.destroy) obj.destroy();
					return false;
				}
				if (memb === 'dl') return !obj[memb] || isQueueActive(obj[memb]);
			}
			return true;
		});

		if (d) console.log('Queue filtered, %d/%d tasks remaining', this._queue.length, len, key, value);
		Later(resetUploadDownload);
	}
};

MegaQueue.prototype.slurp = function(gid)
{
	var res = [];
	this._queue = this._queue.filter(function(item)
	{
		return item[0][gid] ? (res.push(item), false) : true;
	});
	return res;
};

MegaQueue.prototype.pause = function() {
	if (d) { 
		console.log("pausing queue"); 
		if (d > 1 && console.trace) console.trace(); 
	}
	this._paused = true;
	this.trigger('pause')
};

MegaQueue.prototype.isPaused = function() {
	return this._paused;
}

MegaQueue.prototype.pushAll = function(tasks, next, error) {
	function CCQueueChecker(task, response) {
		if (response.length && response[0] === false) {
			/**
			 *	The first argument of .done(false) is false, which 
			 *	means that something went wrong
			 */
			return error(task, response);
		}
		removeValue(tasks, task);
		if (tasks.length == 0) next();
	}
	var i = 0
		, len = tasks.length

	for (i=0; i < len; i++) {
		tasks[i].onQueueDone = CCQueueChecker;
		this.push(tasks[i]);
	}
};

MegaQueue.prototype.run_in_context = function(task) {
	this._running++;
	this._worker(task[0], function MQRicStub() {
		ASSERT(task[0], 'This should not be reached twice.');
		if (!task[0]) return; /* already called */
		this._running--;
		var done = task[1] || task[0].onQueueDone;
		if (done) done.apply(task[2] || this, [task[0], arguments]);
		task[0] = task[1] = task[2] = undefined;
		this._process();
	}.bind(this));
}

MegaQueue.prototype.validateTask = function() {
	return true;
}

MegaQueue.prototype.getNextTask = function() {
	var i, r, len = this._queue.length
	for (i = 0; i < len; i++) {
		if ((r = this.validateTask(this._queue[i][0])))
			return r < 0 ? null : this._queue.splice(i, 1)[0];
	}
	return null;
};

MegaQueue.prototype.process = function() {
	var args;
	if (this._paused) return;
	if (this._later) {
		clearTimeout(this._later);
		delete this._later;
	}
	while (this._running < this._limit && this._queue.length > 0) {
		args = this.getNextTask();
		if (args === null) {
			if ( ++this._noTaskCount == 666 && !$.len(this._qpaused))
			{
				/**
				 * XXX: Prevent an infinite loop when there's a connection hang,
				 * with the UI reporting either "Temporary error; retrying" or
				 * a stalled % Status... [dc]
				 */
				if (d) console.error('*** CHECK THIS ***', this);
				this._noTaskCount = -1;
				return false;
			}
			this._process(1200);
			return false;
		}
		this._noTaskCount = 0;
		this.run_in_context(args);
		this.trigger('working', args);
	}

	if (this._expanded) {
		args = this.getNextTask();
		if (args) {
			this.run_in_context(args);
			this.trigger('working', args);
		}
		delete this._expanded;
	}
	if (!args && this.mull) this.mull();

	return true;
};

MegaQueue.prototype.destroy = function() {
	clearTimeout(this._later);
	// this._limit = -1
	// this._queue = null;
	// this._queue = [];
	oDestroy(this);
}

MegaQueue.prototype._process = function(ms) {
	if (this._later) clearTimeout(this._later);
	this._later = setTimeout(this.process.bind(this), ms || 300);
};

MegaQueue.prototype.push = function(arg, next, self) {
	this._queue.push([arg, next, self]);
	this.trigger('queue');
	this._process();
};

function TransferQueue() {
	MegaQueue.prototype.constructor.apply(this, arguments);
}

inherits(TransferQueue, MegaQueue);

TransferQueue.prototype.mull = function(gid)
{
	if (this.isEmpty() && $.len(this._qpaused))
	{
		this.dispatch(Object.keys(this._qpaused).shift());
	}
};

TransferQueue.prototype.dispatch = function(gid)
{
	// dispatch a paused transfer
	ASSERT(GlobalProgress[gid], 'No transfer associated with ' + gid );
	ASSERT(!GlobalProgress[gid] || this._qpaused[gid], 'This transfer is not in hold: ' + gid );
	
	if (this._qpaused[gid] && !GlobalProgress[gid].paused)
	{
		this._queue = this._qpaused[gid].concat(this._queue);
		delete this._qpaused[gid];
		this._process();
		return true;
	}
	return false;
};


TransferQueue.prototype.pause = function(gid)
{
	if (!gid) return MegaQueue.prototype.pause.apply(this, arguments);

	// pause single transfer
	ASSERT(GlobalProgress[gid], 'No transfer associated with ' + gid );
	ASSERT(!GlobalProgress[gid] || !GlobalProgress[gid].paused, 'This transfer is ALREADY paused: ' + gid );

	if (GlobalProgress[gid])
	{
		var p = GlobalProgress[gid], chunk;
		p.paused = true;
		while ((chunk = p.working.pop()))
		{
			if (d) console.log('Aborting by pause: ' + chunk);
			chunk.abort();
			this.pushFirst(chunk);
			this._running--;
		}
		this._qpaused[gid] = this.slurp(gid);
		$('.transfer-table #' + gid + ' td:eq(2) span.speed').text(' (paused)');
		GlobalProgress[gid].speed = 0; // reset speed
		if (($.transferprogress||{})[gid]) {
			$.transferprogress[gid][2] = 0; // reset speed
		}
		Soon(percent_megatitle);
	}
};


TransferQueue.prototype.resume = function(gid)
{
	if (!gid) return MegaQueue.prototype.resume.apply(this, arguments);

	ASSERT(GlobalProgress[gid], 'No transfer associated with ' + gid );
	ASSERT(!GlobalProgress[gid] || GlobalProgress[gid].paused, 'This transfer is not paused: ' + gid );

	if (GlobalProgress[gid])
	{
		delete GlobalProgress[gid].paused;
		if (this.isEmpty()) this.dispatch(gid);
		$('.transfer-table #' + gid + ' td:eq(2) span.speed').text('');
	}
};
